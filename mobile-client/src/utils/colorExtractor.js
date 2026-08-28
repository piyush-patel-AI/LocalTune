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

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 48; // Fast sampling size
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

          if (a < 128) continue; // Skip transparent

          // Calculate Saturation & Lightness
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 510;
          const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));

          // Ignore extreme black, pure white, or non-saturated grays to get true colorful hues
          if (lum < 0.08 || lum > 0.94) continue;

          // Quantize RGB values into 24-step buckets
          const qr = Math.floor(r / 24) * 24;
          const qg = Math.floor(g / 24) * 24;
          const qb = Math.floor(b / 24) * 24;
          const key = `${qr},${qg},${qb}`;

          // Weight colorful/vibrant pixels higher
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
        // Pick secondary color that is visually distinct from primary
        let secondary = sortedColors.find((c) => {
          const diff = Math.abs(c.r - primary.r) + Math.abs(c.g - primary.g) + Math.abs(c.b - primary.b);
          return diff > 60;
        }) || sortedColors[1] || primary;

        let tertiary = sortedColors.find((c) => {
          const diffP = Math.abs(c.r - primary.r) + Math.abs(c.g - primary.g) + Math.abs(c.b - primary.b);
          const diffS = Math.abs(c.r - secondary.r) + Math.abs(c.g - secondary.g) + Math.abs(c.b - secondary.b);
          return diffP > 50 && diffS > 50;
        }) || sortedColors[2] || secondary;

        resolve({
          c1: `rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.28)`,
          c2: `rgba(${secondary.r}, ${secondary.g}, ${secondary.b}, 0.20)`,
          c3: `rgba(${tertiary.r}, ${tertiary.g}, ${tertiary.b}, 0.12)`,
          rawPrimary: `rgb(${primary.r}, ${primary.g}, ${primary.b})`,
          rawSecondary: `rgb(${secondary.r}, ${secondary.g}, ${secondary.b})`,
          rawTertiary: `rgb(${tertiary.r}, ${tertiary.g}, ${tertiary.b})`,
          ...deriveAccentColor(primary.r, primary.g, primary.b)
        });
      } catch (err) {
        console.warn('[ColorExtractor] Failed to extract canvas color:', err);
        resolve(getDefaultAmbientColors());
      }
    };

    img.onerror = () => {
      resolve(getDefaultAmbientColors());
    };

    img.src = imageUrl;
  });
}

export function getDefaultAmbientColors() {
  return {
    c1: 'rgba(245, 158, 11, 0.18)',
    c2: 'rgba(168, 85, 247, 0.12)',
    c3: 'rgba(239, 68, 68, 0.08)',
    rawPrimary: 'rgb(245, 158, 11)',
    rawSecondary: 'rgb(168, 85, 247)',
    rawTertiary: 'rgb(239, 68, 68)',
    accent: 'rgb(245, 158, 11)',
    accentGlow: 'rgba(245, 158, 11, 0.25)',
    accentHover: 'rgb(217, 119, 6)'
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
  if (colors.accent) root.style.setProperty('--accent-primary', colors.accent);
  if (colors.accentGlow) root.style.setProperty('--accent-glow', colors.accentGlow);
  if (colors.accentHover) root.style.setProperty('--accent-hover', colors.accentHover);
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
 * - Low-saturation (gray / white / black) artwork falls back to the default amber accent.
 * - Otherwise saturation/lightness are clamped to a pleasant range so neon, muddy,
 *   extremely dark, or extremely bright art never produces an ugly UI accent.
 */
function deriveAccentColor(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);
  if (s < 0.3) {
    return {
      accent: 'rgb(245, 158, 11)',
      accentGlow: 'rgba(245, 158, 11, 0.25)',
      accentHover: 'rgb(217, 119, 6)'
    };
  }
  const cs = Math.min(0.85, Math.max(0.5, s));
  const cl = Math.min(0.6, Math.max(0.48, l));
  const main = hslToRgb(h, cs, cl);
  const hover = hslToRgb(h, cs, Math.max(0.4, cl - 0.12));
  return {
    accent: `rgb(${main.r}, ${main.g}, ${main.b})`,
    accentGlow: `rgba(${main.r}, ${main.g}, ${main.b}, 0.28)`,
    accentHover: `rgb(${hover.r}, ${hover.g}, ${hover.b})`
  };
}
