import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPlayLogsForUser, getTransitionsForUser, updateRecommendationStats } from '../../db.js';
import { normalizeGenre, parseGenres } from '../../genreNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory cache for recommendation results per user context
const recommendationCache = new Map();

/**
 * Invalidate recommendation cache (call on track play finish, favorite toggle, scan, or metadata update)
 */
export function invalidateRecommendationCache(userId) {
  if (userId) {
    // Cache keys are composites ("${userId}_${currentTrackId}") because
    // recommendations differ per playing context; drop every entry owned
    // by this user, otherwise favorites/plays would keep serving stale data.
    const prefix = `${userId}_`;
    for (const key of [...recommendationCache.keys()]) {
      if (key.startsWith(prefix)) {
        recommendationCache.delete(key);
      }
    }
  } else {
    recommendationCache.clear();
  }
}

/**
 * Load recommendation configuration dynamically from config/recommendation.json
 */
export function loadRecommendationConfig() {
  const configPath = path.join(__dirname, '../../config/recommendation.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[RecommendationEngine] Warning: Could not read recommendation.json, using defaults.', err.message);
  }

  // Fallback defaults if config file is unavailable
  return {
    version: 'v1',
    weights: {
      completionHigh: 15.0,
      completionMedium: 6.0,
      replayBonusMax: 15.0,
      replayMultiplier: 5.0,
      skipPenaltyBase: -12.0,
      skipRecoveryMultiplier: 0.5,
      frequencyMax: 25.0,
      frequencyMultiplier: 5.5,
      timeDecayRate: 0.04,
      timeDecayBase: 0.4,
      timeDecayScale: 0.6,
      discoveryUnplayed: 18.0,
      discoverySinglePlay: 8.0,
      discoveryLowPlay: 3.0,
      artistMatchCurrentTrack: 20.0,
      albumMatchCurrentTrack: 15.0,
      genreMatchCurrentTrack: 18.0,
      genreAffinityMax: 15.0,
      genreAffinityMultiplier: 3.0,
      artistAffinityMax: 15.0,
      artistAffinityMultiplier: 3.0,
      favoriteBonus: 12.0,
      transitionBoostMax: 25.0,
      transitionBoostMultiplier: 10.0,
      timeOfDayMatchMax: 10.0,
      timeOfDayMultiplier: 4.0
    },
    thresholds: {
      forgottenDays: 30,
      cooldownHours: 6,
      consecutiveSameArtistMax: 2,
      topArtistMaxCount: 4
    }
  };
}

// Helper to parse artist names including feat, ft, &, x, comma, etc.
export function parseArtists(artistString) {
  if (!artistString) return [];
  return artistString
    .toLowerCase()
    .split(/[\/,&\+]|\bfeat\.?\b|\bft\.?\b|\bx\b|\bwith\b/i)
    .map((a) => a.trim())
    .filter(Boolean);
}

// Time window classifier
function getTimeWindow(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Score all candidate tracks and attach scoreBreakdown & reason
 */
export async function scoreTracks({ allTracks, favoritesMap = {}, userId, currentTrackId }) {
  const config = loadRecommendationConfig();
  const w = config.weights;
  const t = config.thresholds;

  // Fetch user history concurrently (async DB backends)
  const [userLogs, userTransitions] = userId
    ? await Promise.all([getPlayLogsForUser(userId), getTransitionsForUser(userId)])
    : [[], []];

  const now = Date.now();
  const currentHour = new Date().getHours();
  const currentWindow = getTimeWindow(currentHour);

  // Group play logs by track_id
  const trackLogsMap = {};
  userLogs.forEach((log) => {
    if (!trackLogsMap[log.track_id]) {
      trackLogsMap[log.track_id] = [];
    }
    trackLogsMap[log.track_id].push(log);
  });

  // Calculate Global Artist Affinity Map
  const artistAffinityMap = {};
  const genreAffinityMap = {};

  userLogs.forEach((log) => {
    const track = allTracks.find((t) => t.id === log.track_id);
    if (!track) return;

    const logDate = new Date(log.timestamp).getTime();
    const daysAgo = (now - logDate) / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.exp(-w.timeDecayRate * daysAgo);
    const completionWeight = log.completion_ratio || 0.5;
    const weight = recencyWeight * completionWeight;

    const artists = parseArtists(track.artist);
    artists.forEach((art) => {
      artistAffinityMap[art] = (artistAffinityMap[art] || 0) + weight;
    });

    const trackGenres = parseGenres(track.genre);
    trackGenres.forEach((g) => {
      genreAffinityMap[g] = (genreAffinityMap[g] || 0) + weight;
    });
  });

  // Include favorited tracks in Artist & Genre Affinity
  allTracks.forEach((tr) => {
    if (favoritesMap[tr.id]) {
      const artists = parseArtists(tr.artist);
      artists.forEach((art) => {
        artistAffinityMap[art] = (artistAffinityMap[art] || 0) + 2.5;
      });
      const trackGenres = parseGenres(tr.genre);
      trackGenres.forEach((g) => {
        genreAffinityMap[g] = (genreAffinityMap[g] || 0) + 2.5;
      });
    }
  });

  // Map transitions for currentTrackId
  const transitionBoostMap = {};
  if (currentTrackId) {
    userTransitions.forEach((trans) => {
      if (trans.from_track_id === currentTrackId) {
        transitionBoostMap[trans.to_track_id] = Math.min(w.transitionBoostMax, trans.transition_count * w.transitionBoostMultiplier);
      }
    });
  }

  // Active playing track context
  const currentTrack = currentTrackId ? allTracks.find((tr) => tr.id === currentTrackId) : null;
  const currentArtists = currentTrack ? parseArtists(currentTrack.artist) : [];
  const currentAlbum = currentTrack ? (currentTrack.album || '').toLowerCase() : '';
  const currentGenres = currentTrack ? parseGenres(currentTrack.genre) : [];

  const scoredTracks = allTracks.map((track) => {
    const trackId = track.id;
    const logs = trackLogsMap[trackId] || [];
    const totalPlays = logs.length;

    const breakdown = {
      artist: 0,
      genre: 0,
      completion: 0,
      discovery: 0,
      transition: 0,
      recent: 0,
      timeOfDay: 0,
      replays: 0,
      skips: 0,
      favorites: 0
    };

    let dominantReason = 'Picked for your daily mix';

    // 1. Completion & Replays
    if (totalPlays > 0) {
      const totalCompletion = logs.reduce((acc, l) => acc + l.completion_ratio, 0);
      const avgCompletion = totalCompletion / totalPlays;

      if (avgCompletion >= 0.9) breakdown.completion += w.completionHigh;
      else if (avgCompletion >= 0.5) breakdown.completion += w.completionMedium;

      const replays = logs.filter((l) => l.is_replay).length;
      if (replays > 0) {
        breakdown.replays = Math.min(w.replayBonusMax, replays * w.replayMultiplier);
      }

      const skips = logs.filter((l) => l.is_skip).length;
      if (skips > 0) {
        let skipPenalty = skips * w.skipPenaltyBase;
        const hasRecovered = logs.some((l) => l.completion_ratio >= 0.8);
        if (hasRecovered) skipPenalty *= w.skipRecoveryMultiplier;
        breakdown.skips = skipPenalty;
      }

      // Time Decay Weighting
      const mostRecentLog = logs[0];
      const logDate = new Date(mostRecentLog.timestamp).getTime();
      const daysAgo = (now - logDate) / (1000 * 60 * 60 * 24);
      breakdown.recent = Math.min(w.frequencyMax, Math.log2(1 + totalPlays) * w.frequencyMultiplier) * (w.timeDecayBase + w.timeDecayScale * Math.exp(-w.timeDecayRate * daysAgo));
    }

    // 2. Discovery
    if (totalPlays === 0) {
      breakdown.discovery += w.discoveryUnplayed;
      dominantReason = "You've never played this track";
    } else if (totalPlays === 1) {
      breakdown.discovery += w.discoverySinglePlay;
    } else if (totalPlays <= 3) {
      breakdown.discovery += w.discoveryLowPlay;
    }

    // 3. Current Context & Artist/Genre Matching
    const trackArtists = parseArtists(track.artist);
    if (currentArtists.length > 0 && trackArtists.some((a) => currentArtists.includes(a))) {
      breakdown.artist += w.artistMatchCurrentTrack;
      dominantReason = `Similar to current song by ${track.artist}`;
    }

    if (currentAlbum && (track.album || '').toLowerCase() === currentAlbum) {
      breakdown.artist += w.albumMatchCurrentTrack;
    }

    let artistAffinityBonus = 0;
    trackArtists.forEach((a) => {
      if (artistAffinityMap[a]) {
        artistAffinityBonus += Math.min(w.artistAffinityMax, artistAffinityMap[a] * w.artistAffinityMultiplier);
      }
    });
    breakdown.artist += artistAffinityBonus;
    if (artistAffinityBonus > 10 && !currentTrackId) {
      dominantReason = `Because you often listen to ${track.artist}`;
    }

    const trackGenres = parseGenres(track.genre);
    if (trackGenres.length > 0) {
      if (currentGenres.length > 0) {
        const overlapping = trackGenres.filter((g) => currentGenres.includes(g));
        if (overlapping.length > 0) {
          const ratio = overlapping.length / Math.max(currentGenres.length, trackGenres.length);
          breakdown.genre += w.genreMatchCurrentTrack * (0.6 + 0.4 * ratio);
          dominantReason = `Matches current genre: ${overlapping[0]}`;
        }
      }

      let totalGenreAffinity = 0;
      let topAffinityGenre = null;
      let maxAff = -1;

      trackGenres.forEach((g) => {
        const aff = genreAffinityMap[g] || 0;
        if (aff > maxAff) {
          maxAff = aff;
          topAffinityGenre = g;
        }
        totalGenreAffinity += aff;
      });

      if (totalGenreAffinity > 0) {
        const avgAffinity = totalGenreAffinity / trackGenres.length;
        breakdown.genre += Math.min(w.genreAffinityMax, avgAffinity * w.genreAffinityMultiplier);
        if (avgAffinity > 10 && dominantReason.includes('daily mix') && topAffinityGenre) {
          dominantReason = `From your top genre: ${topAffinityGenre}`;
        }
      }
    }

    // 4. Favorites
    if (favoritesMap[trackId]) {
      breakdown.favorites += w.favoriteBonus;
      if (dominantReason.includes('daily mix')) {
        dominantReason = 'From your favorited tracks';
      }
    }

    // 5. Transition Learning
    if (transitionBoostMap[trackId]) {
      breakdown.transition += transitionBoostMap[trackId];
      if (currentTrack) {
        dominantReason = `Frequently played after ${currentTrack.title}`;
      }
    }

    // 6. Time of Day
    const sameWindowPlays = logs.filter((l) => getTimeWindow(l.hour_of_day) === currentWindow).length;
    if (sameWindowPlays > 0) {
      breakdown.timeOfDay += Math.min(w.timeOfDayMatchMax, sameWindowPlays * w.timeOfDayMultiplier);
      if (sameWindowPlays >= 2 && dominantReason.includes('daily mix')) {
        dominantReason = `Popular during your ${currentWindow} sessions`;
      }
    }

    // Total final score
    const totalScore = Math.max(0, Math.round(
      breakdown.artist +
      breakdown.genre +
      breakdown.completion +
      breakdown.discovery +
      breakdown.transition +
      breakdown.recent +
      breakdown.timeOfDay +
      breakdown.replays +
      breakdown.skips +
      breakdown.favorites
    ));

    return {
      track: {
        ...track,
        score: totalScore,
        reason: dominantReason,
        scoreBreakdown: breakdown
      },
      totalScore,
      logs
    };
  });

  return scoredTracks;
}

/**
 * Filter out tracks in cooldown (recently recommended within X hours)
 */
function applyCooldown(scoredTracks, cooldownHours = 6) {
  const now = Date.now();
  const cooldownMs = cooldownHours * 60 * 60 * 1000;

  return scoredTracks.filter(({ track }) => {
    if (!track.last_recommended_at) return true;
    const lastRecTime = new Date(track.last_recommended_at).getTime();
    if (now - lastRecTime < cooldownMs && track.score < 80) {
      return false; // Skip if in cooldown unless score is exceptional
    }
    return true;
  });
}

/**
 * Main function: Generate recommendations for single shelf / generic endpoint
 */
export async function generateRecommendations({ allTracks, favoritesMap = {}, userId, currentTrackId, count = 20 }) {
  const cacheKey = `${userId || 'guest'}_${currentTrackId || 'none'}`;
  if (recommendationCache.has(cacheKey)) {
    return recommendationCache.get(cacheKey);
  }

  const scoredTracks = await scoreTracks({ allTracks, favoritesMap, userId, currentTrackId });
  const candidates = scoredTracks.filter(({ track }) => !currentTrackId || track.id !== currentTrackId);
  candidates.sort((a, b) => b.totalScore - a.totalScore);

  const selected = [];
  const artistCounts = {};
  let consecutiveSameArtistCount = 0;
  let lastArtist = null;

  for (const item of candidates) {
    if (selected.length >= count) break;
    const track = item.track;
    const primaryArtist = parseArtists(track.artist)[0] || 'unknown';

    if (primaryArtist === lastArtist && consecutiveSameArtistCount >= 2) continue;
    if ((artistCounts[primaryArtist] || 0) >= 4) continue;

    selected.push(track);
    artistCounts[primaryArtist] = (artistCounts[primaryArtist] || 0) + 1;

    if (primaryArtist === lastArtist) {
      consecutiveSameArtistCount++;
    } else {
      consecutiveSameArtistCount = 1;
      lastArtist = primaryArtist;
    }
  }

  // Fallback if diversity filter is strict
  if (selected.length < count) {
    for (const item of candidates) {
      if (selected.length >= count) break;
      if (!selected.some((t) => t.id === item.track.id)) {
        selected.push(item.track);
      }
    }
  }

  // Update telemetry for recommended tracks (concurrently)
  await Promise.all(selected.map((tr) => updateRecommendationStats(tr.id)));

  recommendationCache.set(cacheKey, selected);
  return selected;
}

/**
 * Generate Discovery Radar shelf (prioritizes 0-play / 1-play songs matching genres/artists)
 */
export async function generateDiscoveryRadar({ allTracks, favoritesMap = {}, userId, count = 10 }) {
  const scored = await scoreTracks({ allTracks, favoritesMap, userId });
  const discoveryCandidates = scored.filter(({ logs }) => logs.length <= 1);
  discoveryCandidates.sort((a, b) => b.totalScore - a.totalScore);

  const filtered = applyCooldown(discoveryCandidates).slice(0, count).map((item) => ({
    ...item.track,
    reason: item.logs.length === 0 ? "You've never played this track" : "Discover new tracks from your favorite genres"
  }));

  return filtered;
}

/**
 * Generate Forgotten Favorites shelf (favorites/heavily played not played in 30+ days)
 */
export async function generateForgottenFavorites({ allTracks, favoritesMap = {}, userId, count = 10 }) {
  const scored = await scoreTracks({ allTracks, favoritesMap, userId });
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const forgotten = scored.filter(({ track, logs }) => {
    const isFav = !!favoritesMap[track.id];
    const isHeavy = logs.length >= 3;
    if (!isFav && !isHeavy) return false;

    if (logs.length === 0) return true;
    const lastPlayTime = new Date(logs[0].timestamp).getTime();
    return now - lastPlayTime >= thirtyDaysMs;
  });

  forgotten.sort((a, b) => b.totalScore - a.totalScore);

  return forgotten.slice(0, count).map((item) => ({
    ...item.track,
    reason: "One of your forgotten favorites"
  }));
}

/**
 * Generate Endless Autoplay tracks (5-10 contextual tracks when queue ends)
 */
export async function generateAutoplayTracks({ allTracks, favoritesMap = {}, userId, currentTrackId, excludeTrackIds = [], count = 5 }) {
  const scored = await scoreTracks({ allTracks, favoritesMap, userId, currentTrackId });
  const excludeSet = new Set(excludeTrackIds);

  const candidates = scored.filter(({ track }) => !excludeSet.has(track.id) && track.id !== currentTrackId);
  candidates.sort((a, b) => b.totalScore - a.totalScore);

  return candidates.slice(0, count).map((item) => item.track);
}

/**
 * Generate Multiple Generic Shelves for API response: [ { id, title, priority, tracks } ]
 */
export async function generateShelves({ allTracks, favoritesMap = {}, userId, currentTrackId }) {
  const scored = await scoreTracks({ allTracks, favoritesMap, userId, currentTrackId });

  // 1. Continue Listening (tracks recently listened to with completion)
  const continueListening = scored
    .filter(({ logs }) => logs.length > 0 && logs[0].completion_ratio >= 0.4)
    .sort((a, b) => new Date(b.logs[0].timestamp) - new Date(a.logs[0].timestamp))
    .slice(0, 8)
    .map((i) => ({ ...i.track, reason: 'Picked up from your recent session' }));

  // 2-4. Sub-shelves (concurrent; each hits its own cache key)
  const [recommendedForYou, discoveryRadar, forgottenFavorites] = await Promise.all([
    generateRecommendations({ allTracks, favoritesMap, userId, currentTrackId, count: 12 }),
    generateDiscoveryRadar({ allTracks, favoritesMap, userId, count: 8 }),
    generateForgottenFavorites({ allTracks, favoritesMap, userId, count: 8 })
  ]);

  // 5. Hidden Gems (Low play count 1-3, high score)
  const hiddenGems = scored
    .filter(({ logs }) => logs.length >= 1 && logs.length <= 3)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 8)
    .map((i) => ({ ...i.track, reason: 'A hidden gem you might love' }));

  // 6. Recently Added (Newest tracks added to library)
  const recentlyAdded = [...allTracks]
    .sort((a, b) => new Date(b.date_added || b.date_modified) - new Date(a.date_added || a.date_modified))
    .slice(0, 8)
    .map((t) => ({ ...t, reason: 'Recently added to your library' }));

  // Assemble dynamic ordered shelves array
  const shelves = [
    { id: 'continue', title: 'Continue Listening', priority: 1, tracks: continueListening },
    { id: 'recommended', title: 'Recommended For You', priority: 2, tracks: recommendedForYou },
    { id: 'discovery', title: 'Discovery Radar', priority: 3, tracks: discoveryRadar },
    { id: 'forgotten', title: 'Forgotten Favorites', priority: 4, tracks: forgottenFavorites },
    { id: 'hiddenGems', title: 'Hidden Gems', priority: 5, tracks: hiddenGems },
    { id: 'recentlyAdded', title: 'Recently Added', priority: 6, tracks: recentlyAdded }
  ];

  // 7. Artist Radio (if current song exists)
  if (currentTrackId) {
    const currentTrack = allTracks.find((t) => t.id === currentTrackId);
    if (currentTrack) {
      const radioTracks = scored
        .filter(({ track }) => track.id !== currentTrackId && parseArtists(track.artist).some((a) => parseArtists(currentTrack.artist).includes(a)))
        .slice(0, 8)
        .map((i) => ({ ...i.track, reason: `Artist Radio: ${currentTrack.artist}` }));

      if (radioTracks.length > 0) {
        shelves.unshift({ id: 'artistRadio', title: `Song Radio (${currentTrack.title})`, priority: 0, tracks: radioTracks });
      }
    }
  }

  return shelves;
}
