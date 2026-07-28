import { getPlayLogsForUser, getTransitionsForUser } from './db.js';

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
 * Smart Offline Recommendation Engine
 */
export function generateRecommendations({ allTracks, favoritesMap = {}, userId, currentTrackId }) {
  const userLogs = userId ? getPlayLogsForUser(userId) : [];
  const userTransitions = userId ? getTransitionsForUser(userId) : [];

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
  userLogs.forEach((log) => {
    const track = allTracks.find((t) => t.id === log.track_id);
    if (!track) return;

    const logDate = new Date(log.timestamp).getTime();
    const daysAgo = (now - logDate) / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.exp(-0.04 * daysAgo); // Time Decay Weighting

    const completionWeight = log.completion_ratio || 0.5;
    const weight = recencyWeight * completionWeight;

    const artists = parseArtists(track.artist);
    artists.forEach((art) => {
      artistAffinityMap[art] = (artistAffinityMap[art] || 0) + weight;
    });
  });

  // Also include favorited tracks in Artist Affinity
  allTracks.forEach((t) => {
    if (favoritesMap[t.id]) {
      const artists = parseArtists(t.artist);
      artists.forEach((art) => {
        artistAffinityMap[art] = (artistAffinityMap[art] || 0) + 2.5;
      });
    }
  });

  // Map transitions for currentTrackId
  const transitionBoostMap = {};
  if (currentTrackId) {
    userTransitions.forEach((trans) => {
      if (trans.from_track_id === currentTrackId) {
        transitionBoostMap[trans.to_track_id] = Math.min(25, trans.transition_count * 10);
      }
    });
  }

  // Determine current active track details
  const currentTrack = currentTrackId ? allTracks.find((t) => t.id === currentTrackId) : null;
  const currentArtists = currentTrack ? parseArtists(currentTrack.artist) : [];
  const currentAlbum = currentTrack ? (currentTrack.album || '').toLowerCase() : '';

  // Score candidate tracks
  const candidates = allTracks.filter((t) => !currentTrackId || t.id !== currentTrackId);

  const scoredCandidates = candidates.map((track) => {
    let score = 0;
    const trackId = track.id;
    const logs = trackLogsMap[trackId] || [];
    const totalPlays = logs.length;

    // --- Signal 1 & 4: Listening Completion & Negative Feedback ---
    let completionScore = 0;
    let skipPenalty = 0;

    if (totalPlays > 0) {
      const totalCompletion = logs.reduce((acc, l) => acc + l.completion_ratio, 0);
      const avgCompletion = totalCompletion / totalPlays;

      if (avgCompletion >= 0.9) completionScore += 15;
      else if (avgCompletion >= 0.5) completionScore += 6;

      const replays = logs.filter((l) => l.is_replay).length;
      completionScore += Math.min(15, replays * 5);

      const skips = logs.filter((l) => l.is_skip).length;
      if (skips > 0) {
        skipPenalty = skips * -12;
        // Natural recovery: if completed at least once after skips
        const hasRecovered = logs.some((l) => l.completion_ratio >= 0.8);
        if (hasRecovered) {
          skipPenalty = skipPenalty * 0.5;
        }
      }
    }

    score += completionScore + skipPenalty;

    // --- Signal 2: Play Frequency (Logarithmic Scaling) ---
    const frequencyScore = Math.min(25, Math.log2(1 + totalPlays) * 5.5);
    score += frequencyScore;

    // --- Signal 3: Time Decay Weighting ---
    if (totalPlays > 0) {
      const mostRecentLog = logs[0]; // ordered DESC
      const logDate = new Date(mostRecentLog.timestamp).getTime();
      const daysAgo = (now - logDate) / (1000 * 60 * 60 * 24);
      const timeDecayMultiplier = 0.4 + 0.6 * Math.exp(-0.04 * daysAgo);
      score = score * timeDecayMultiplier;
    }

    // --- Signal 6: Smarter Discovery ---
    if (totalPlays === 0) score += 18;
    else if (totalPlays === 1) score += 8;
    else if (totalPlays <= 3) score += 3;

    // --- Signal 7: Artist Affinity & Current Context Matching ---
    const trackArtists = parseArtists(track.artist);
    let artistMatchScore = 0;

    // Match with current track artist
    if (currentArtists.length > 0 && trackArtists.some((a) => currentArtists.includes(a))) {
      artistMatchScore += 20;
    }

    // Match with album
    if (currentAlbum && (track.album || '').toLowerCase() === currentAlbum) {
      score += 15;
    }

    // Cumulative artist affinity bonus
    let affinityBonus = 0;
    trackArtists.forEach((a) => {
      if (artistAffinityMap[a]) {
        affinityBonus += Math.min(15, artistAffinityMap[a] * 3);
      }
    });
    score += artistMatchScore + affinityBonus;

    // Favorited bonus
    if (favoritesMap[trackId]) {
      score += 12;
    }

    // --- Signal 8: Song Transition Learning (Co-listening) ---
    if (transitionBoostMap[trackId]) {
      score += transitionBoostMap[trackId];
    }

    // --- Signal 9: Time-of-Day Preferences ---
    const sameWindowPlays = logs.filter((l) => getTimeWindow(l.hour_of_day) === currentWindow).length;
    if (sameWindowPlays > 0) {
      score += Math.min(10, sameWindowPlays * 4);
    }

    return { track, score };
  });

  // Sort descending by score
  scoredCandidates.sort((a, b) => b.score - a.score);

  // --- Signal 5: Artist Diversity (Interleaving) ---
  const selectedTracks = [];
  const artistCounts = {};
  let consecutiveSameArtistCount = 0;
  let lastArtist = null;

  for (let i = 0; i < scoredCandidates.length; i++) {
    if (selectedTracks.length >= 20) break;

    const candidate = scoredCandidates[i].track;
    const primaryArtist = parseArtists(candidate.artist)[0] || 'unknown';

    // Limit consecutive recommendations from the same artist to max 2
    if (primaryArtist === lastArtist && consecutiveSameArtistCount >= 2) {
      continue;
    }

    // Cap total recommendations per primary artist in top 20 to max 4
    if ((artistCounts[primaryArtist] || 0) >= 4) {
      continue;
    }

    selectedTracks.push(candidate);
    artistCounts[primaryArtist] = (artistCounts[primaryArtist] || 0) + 1;

    if (primaryArtist === lastArtist) {
      consecutiveSameArtistCount++;
    } else {
      consecutiveSameArtistCount = 1;
      lastArtist = primaryArtist;
    }
  }

  // Fallback if diversity filter selected fewer than 20 tracks
  if (selectedTracks.length < 20) {
    for (let i = 0; i < scoredCandidates.length; i++) {
      if (selectedTracks.length >= 20) break;
      const candidate = scoredCandidates[i].track;
      if (!selectedTracks.some((t) => t.id === candidate.id)) {
        selectedTracks.push(candidate);
      }
    }
  }

  return selectedTracks;
}
