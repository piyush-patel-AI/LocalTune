/**
 * extractColorsFromAlbumArt
 * Extracts vibrant dominant colors from an album art image using Canvas.
 */
export async function extractColorsFromAlbumArt(imageUrl) {
  if (!imageUrl) {
    return getDefaultAmbientColors();
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(getDefaultAmbientColors());
      }
    }, 8000);

    img.onload = () => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 48;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;

        const colorMap = {};

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a < 128) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 510;
          const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));

          if (lum < 0.08 || lum > 0.94) continue;

          const qr = Math.floor(r / 24) * 24;
          const qg = Math.floor(g / 24) * 24;
          const qb = Math.floor(b / 24) * 24;
          const key = `${qr},${qg},${qb}`;

          const weight = 1 + sat * 3;

          if (!colorMap[key]) {
            colorMap[key] = { r: qr, g: qg, b: qb, sat, count: 0 };
          }
          colorMap[key].count += weight;
        }

        const sortedColors = Object.values(colorMap).sort((a, b) => b.count - a.count);

        if (sortedColors.length === 0) {
          return resolve(getDefaultAmbientColors());
        }

        const primary = sortedColors[0];
        let secondary = sortedColors.find((c) => {
          const diff = Math.abs(c.r - primary.r) + Math.abs(c.g - primary.g) + Math.abs(c.b - primary.b);
          return diff > 60;
        }) || sortedColors[1] || primary;

        let tertiary = sortedColors.find((c) => {
          const diffP = Math.abs(c.r - primary.r) + Math.abs(c.g - primary.g) + Math.abs(c.b - primary.b);
          const diffS = Math.abs(c.r - secondary.r) + Math.abs(c.g - secondary.g) + Math.abs(c.b - secondary.b);
          return diffP > 50 && diffS > 50;
        }) || sortedColors[2] || secondary;

        const accentResult = deriveAccentColor(primary.r, primary.g, primary.b);

        if (!accentResult.valid) {
          return resolve(getDefaultAmbientColors());
        }

        resolve({
          c1: `rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.28)`,
          c2: `rgba(${secondary.r}, ${secondary.g}, ${secondary.b}, 0.20)`,
          c3: `rgba(${tertiary.r}, ${tertiary.g}, ${tertiary.b}, 0.12)`,
          rawPrimary: `rgb(${primary.r}, ${primary.g}, ${primary.b})`,
          rawSecondary: `rgb(${secondary.r}, ${secondary.g}, ${secondary.b})`,
          rawTertiary: `rgb(${tertiary.r}, ${tertiary.g}, ${tertiary.b})`,
          ...accentResult
        });
      } catch (err) {
        console.warn('[ColorExtractor] Failed to extract canvas color:', err);
        resolve(getDefaultAmbientColors());
      }
    };

    img.onerror = () => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      resolve(getDefaultAmbientColors());
    };

    img.src = imageUrl;
  });
}

const DEFAULT_ACCENT = 'rgb(78, 168, 222)';
const DEFAULT_ACCENT_HOVER = 'rgb(56, 144, 200)';

export function getDefaultAmbientColors() {
  return {
    c1: 'rgba(78, 168, 222, 0.18)',
    c2: 'rgba(168, 85, 247, 0.12)',
    c3: 'rgba(239, 68, 68, 0.08)',
    rawPrimary: 'rgb(78, 168, 222)',
    rawSecondary: 'rgb(168, 85, 247)',
    rawTertiary: 'rgb(239, 68, 68)',
    accent: DEFAULT_ACCENT,
    accentHover: DEFAULT_ACCENT_HOVER
  };
}

export function applyAmbientColorsToDOM(colors) {
  if (!colors) return;
  const root = document.documentElement;
  root.style.setProperty('--ambient-color-1', colors.c1);
  root.style.setProperty('--ambient-color-2', colors.c2);
  root.style.setProperty('--ambient-color-3', colors.c3);
  root.style.setProperty('--ambient-raw-1', colors.rawPrimary);
  root.style.setProperty('--ambient-raw-2', colors.rawSecondary);
  root.style.setProperty('--ambient-raw-3', colors.rawTertiary);

  // EXPERIMENT: the app-wide accent is pinned to the static Octave blue
  // (#4EA8DE defined in :root). Extracted artwork colors are still computed and
  // exposed above (--ambient-*) for Now Playing / effects, but do not override
  // the global --accent-primary / --accent-hover so the app shell keeps its
  // subtle blue accents regardless of the playing artwork.
  // To restore dynamic accents, uncomment the two lines below.
  // if (colors.accent) root.style.setProperty('--accent-primary', colors.accent);
  // if (colors.accentHover) root.style.setProperty('--accent-hover', colors.accentHover);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: break;
    }
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  h /= 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  let r = 0; let g = 0; let b = 0;
  if (h < 1 / 6) { r = c; g = x; b = 0; }
  else if (h < 2 / 6) { r = x; g = c; b = 0; }
  else if (h < 3 / 6) { r = 0; g = c; b = x; }
  else if (h < 4 / 6) { r = 0; g = x; b = c; }
  else if (h < 5 / 6) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

/**
 * Derive a controlled, readable accent from a raw extracted RGB.
 * Returns { accent, accentGlow, accentHover, valid }.
 * valid=false means the extracted color is unusable and caller should fallback.
 */
function deriveAccentColor(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);

  if (s < 0.25) {
    return { valid: false };
  }

  if (l < 0.12 || l > 0.92) {
    return { valid: false };
  }

  const cs = Math.min(0.85, Math.max(0.5, s));
  const cl = Math.min(0.6, Math.max(0.48, l));
  const main = hslToRgb(h, cs, cl);

  const mainLum = (Math.max(main.r, main.g, main.b) + Math.min(main.r, main.g, main.b)) / 510;
  if (mainLum < 0.15 || mainLum > 0.9) {
    return { valid: false };
  }

  const hover = hslToRgb(h, cs, Math.max(0.4, cl - 0.12));
  return {
    valid: true,
    accent: `rgb(${main.r}, ${main.g}, ${main.b})`,
    accentHover: `rgb(${hover.r}, ${hover.g}, ${hover.b})`
  };
}
