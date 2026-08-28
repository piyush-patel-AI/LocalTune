import { useState } from 'react';

/**
 * ArtworkImage
 *
 * Renders an artwork image with a shimmer skeleton placeholder that matches the
 * surrounding card box, then fades the image in once it has decoded. This keeps
 * the exact card shapes/sizes (the real <img> class drives the box dimensions)
 * while giving a polished loading state and avoiding layout shift.
 *
 * - Default loading is "lazy" (kept from the first perf pass) so off-screen
 *   Speed Dial pages do not decode eagerly. Pass eager for above-the-fold art.
 * - The skeleton is hidden via opacity (fades out) when the image loads; the
 *   actual <img> fades in over it, so there is no flash.
 */
export default function ArtworkImage({ src, alt = '', className = '', onError, eager = false }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <span className={`artwork-img-wrap ${className}`}>
      <span className="artwork-skeleton" style={{ opacity: loaded ? 0 : 1 }} aria-hidden="true" />
      <img
        src={src}
        alt={alt}
        className={className}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          setLoaded(true);
          if (onError) onError(e);
        }}
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </span>
  );
}
