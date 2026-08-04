export const CANONICAL_GENRES = [
  'Pop',
  'Rock',
  'Alternative Rock',
  'Hip-Hop',
  'Rap',
  'R&B',
  'EDM',
  'House',
  'Bollywood',
  'Anime',
  'Classical',
  'Jazz',
  'Metal',
  'Country',
  'Folk',
  'Lo-fi',
  'Synthwave'
];

const GENRE_MAPPINGS = {
  'pop': 'Pop',
  'rock': 'Rock',
  'alt rock': 'Alternative Rock',
  'alternative rock': 'Alternative Rock',
  'alternative': 'Alternative Rock',
  'alt-rock': 'Alternative Rock',
  'hip hop': 'Hip-Hop',
  'hip-hop': 'Hip-Hop',
  'hiphop': 'Hip-Hop',
  'rap': 'Rap',
  'r&b': 'R&B',
  'r n b': 'R&B',
  'rhythm and blues': 'R&B',
  'edm': 'EDM',
  'electronic': 'EDM',
  'house': 'House',
  'deep house': 'House',
  'bollywood': 'Bollywood',
  'hindi': 'Bollywood',
  'anime': 'Anime',
  'classical': 'Classical',
  'jazz': 'Jazz',
  'metal': 'Metal',
  'heavy metal': 'Metal',
  'country': 'Country',
  'folk': 'Folk',
  'acoustic': 'Folk',
  'lo fi': 'Lo-fi',
  'lofi': 'Lo-fi',
  'lo-fi': 'Lo-fi',
  'synthwave': 'Synthwave',
  'retrowave': 'Synthwave'
};

export function normalizeSingleGenre(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (GENRE_MAPPINGS[lower]) {
    return GENRE_MAPPINGS[lower];
  }

  // Capitalize words for clean custom genres (e.g., "phonk" -> "Phonk", "future bass" -> "Future Bass")
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function parseGenres(input) {
  if (!input) return [];
  let rawList = [];
  if (Array.isArray(input)) {
    rawList = input;
  } else if (typeof input === 'string') {
    rawList = input.split(/[,;/]+/);
  } else {
    return [];
  }

  const result = [];
  const seen = new Set();
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const norm = normalizeSingleGenre(item);
    if (norm && !seen.has(norm.toLowerCase())) {
      seen.add(norm.toLowerCase());
      result.push(norm);
    }
  }
  return result;
}

export function normalizeGenre(input) {
  const parsed = parseGenres(input);
  if (parsed.length === 0) return null;
  return parsed.join(', ');
}
