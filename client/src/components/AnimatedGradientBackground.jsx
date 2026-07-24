import { useEffect, useRef, useState } from 'react';

/**
 * AnimatedGradientBackground
 *
 * Renders a customizable animated radial gradient background with a subtle breathing effect.
 */
export default function AnimatedGradientBackground({
  startingGap = 125,
  Breathing = true,
  gradientColors = [
    "#0A0A0A",
    "#1c1917",
    "#451a03",
    "#78350f",
    "#b45309",
    "#d97706",
    "#0A0A0A"
  ],
  gradientStops = [35, 50, 60, 70, 80, 90, 100],
  animationSpeed = 0.02,
  breathingRange = 5,
  containerStyle = {},
  topOffset = 0,
  containerClassName = ""
}) {
  const containerRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let animationFrame;
    let width = startingGap;
    let directionWidth = 1;

    const animateGradient = () => {
      if (width >= startingGap + breathingRange) directionWidth = -1;
      if (width <= startingGap - breathingRange) directionWidth = 1;

      if (!Breathing) directionWidth = 0;
      width += directionWidth * animationSpeed;

      const gradientStopsString = gradientStops
        .map((stop, index) => `${gradientColors[index]} ${stop}%`)
        .join(", ");

      const gradient = `radial-gradient(${width}% ${width + topOffset}% at 50% 20%, ${gradientStopsString})`;

      if (containerRef.current) {
        containerRef.current.style.background = gradient;
      }

      animationFrame = requestAnimationFrame(animateGradient);
    };

    animationFrame = requestAnimationFrame(animateGradient);

    return () => cancelAnimationFrame(animationFrame);
  }, [startingGap, Breathing, gradientColors, gradientStops, animationSpeed, breathingRange, topOffset]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'scale(1)' : 'scale(1.2)',
        transition: 'opacity 2s cubic-bezier(0.25, 0.1, 0.25, 1), transform 2s cubic-bezier(0.25, 0.1, 0.25, 1)',
        ...containerStyle
      }}
      className={containerClassName}
    >
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          transition: 'transform 0.5s ease'
        }}
      />
    </div>
  );
}
