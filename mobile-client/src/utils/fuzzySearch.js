/**
 * Fuzzy search utility for tracks.
 * Handles typos, missing characters, extra characters, swapped characters,
 * missing/incorrect spaces, and partial words.
 */

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array(n + 1);
  const curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function tokenMatchScore(queryTokens, textTokens) {
  let matched = 0;
  for (const qt of queryTokens) {
    for (const tt of textTokens) {
      if (tt.includes(qt) || qt.includes(tt)) {
        matched++;
        break;
      }
    }
  }
  return matched / queryTokens.length;
}

function fuzzyTokenScore(queryTokens, textTokens) {
  let totalScore = 0;
  for (const qt of queryTokens) {
    let best = 0;
    for (const tt of textTokens) {
      if (tt === qt) { best = 1; break; }
      if (tt.includes(qt) || qt.includes(tt)) {
        best = Math.max(best, 0.8);
        continue;
      }
      const maxLen = Math.max(qt.length, tt.length);
      if (maxLen === 0) continue;
      const dist = editDistance(qt, tt);
      const sim = 1 - dist / maxLen;
      if (sim > 0.5) {
        best = Math.max(best, sim * 0.7);
      }
    }
    totalScore += best;
  }
  return totalScore / queryTokens.length;
}

/**
 * Score a track against a search query.
 * Returns { score, matchType } where higher score = better match.
 */
export function scoreTrack(track, query) {
  const nq = normalize(query);
  if (!nq) return { score: 0, matchType: 'none' };

  const title = normalize(track.title);
  const artist = normalize(track.artist);
  const album = normalize(track.album);
  const combined = `${title} ${artist} ${album}`;

  const queryTokens = nq.split(' ').filter(Boolean);
  const titleTokens = title.split(' ').filter(Boolean);
  const artistTokens = artist.split(' ').filter(Boolean);
  const combinedTokens = combined.split(' ').filter(Boolean);

  // 1. Exact matches (score 1.0)
  if (title === nq) return { score: 1.0, matchType: 'exact_title' };
  if (artist === nq) return { score: 0.95, matchType: 'exact_artist' };
  if (album === nq) return { score: 0.9, matchType: 'exact_album' };

  // 2. Prefix matches (score 0.92-0.88)
  if (title.startsWith(nq)) return { score: 0.92, matchType: 'prefix_title' };
  if (artist.startsWith(nq)) return { score: 0.89, matchType: 'prefix_artist' };

  // 3. Substring matches (score 0.85-0.75)
  if (title.includes(nq)) return { score: 0.85, matchType: 'substring_title' };
  if (artist.includes(nq)) return { score: 0.82, matchType: 'substring_artist' };
  if (album.includes(nq)) return { score: 0.78, matchType: 'substring_album' };

  // 4. All query tokens found in title/artist (score 0.75-0.65)
  const titleTokenMatch = tokenMatchScore(queryTokens, titleTokens);
  if (titleTokenMatch >= 1) return { score: 0.75, matchType: 'token_title_full' };
  if (titleTokenMatch >= 0.5) return { score: 0.68, matchType: 'token_title_partial' };

  const artistTokenMatch = tokenMatchScore(queryTokens, artistTokens);
  if (artistTokenMatch >= 1) return { score: 0.72, matchType: 'token_artist_full' };
  if (artistTokenMatch >= 0.5) return { score: 0.65, matchType: 'token_artist_partial' };

  // 5. Fuzzy token matching (score 0.6-0.4)
  const fuzzyTitle = fuzzyTokenScore(queryTokens, titleTokens);
  if (fuzzyTitle > 0.5) return { score: 0.4 + fuzzyTitle * 0.2, matchType: 'fuzzy_title' };

  const fuzzyArtist = fuzzyTokenScore(queryTokens, artistTokens);
  if (fuzzyArtist > 0.5) return { score: 0.38 + fuzzyArtist * 0.2, matchType: 'fuzzy_artist' };

  // 6. Combined fuzzy (score 0.35-0.25)
  const fuzzyCombined = fuzzyTokenScore(queryTokens, combinedTokens);
  if (fuzzyCombined > 0.5) return { score: 0.25 + fuzzyCombined * 0.1, matchType: 'fuzzy_combined' };

  // 7. Single-char prefix match fallback
  for (const qt of queryTokens) {
    if (qt.length >= 2) {
      for (const tt of titleTokens) {
        if (tt.startsWith(qt.slice(0, 2))) return { score: 0.3, matchType: 'prefix2_title' };
      }
      for (const tt of artistTokens) {
        if (tt.startsWith(qt.slice(0, 2))) return { score: 0.28, matchType: 'prefix2_artist' };
      }
    }
  }

  return { score: 0, matchType: 'none' };
}

/**
 * Search tracks with fuzzy matching and ranking.
 * Returns tracks sorted by relevance score, filtered to minimum threshold.
 */
export function fuzzySearch(tracks, query, maxResults = 30) {
  if (!query || !query.trim()) return [];

  const nq = normalize(query);
  if (!nq) return [];

  const scored = [];
  for (const track of tracks) {
    const { score, matchType } = scoreTrack(track, query);
    if (score >= 0.25) {
      scored.push({ track, score, matchType });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(({ track, score }) => track);
}
