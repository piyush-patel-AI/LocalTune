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
          rawTertiary: `rgb(${tertiary.r}, ${tertiary.g}, ${tertiary.b})`
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
    rawTertiary: 'rgb(239, 68, 68)'
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
}
