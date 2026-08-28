import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function BottomSheet({
  onClose,
  children,
  className = '',
  style = {},
  maxHeight = '85vh'
}) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const sheetRef = useRef(null);

  const handleStart = (e) => {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Check if inner content is scrolled down; only initiate drag down if at top
    if (sheetRef.current) {
      const scrollable = sheetRef.current.querySelector('.sheet-scroll-container, [style*="overflowY"], [style*="overflow-y"]');
      if (scrollable && scrollable.scrollTop > 0) {
        return;
      }
    }

    startYRef.current = clientY;
    setIsDragging(true);
  };

  const handleMove = (e) => {
    if (!isDragging) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - startYRef.current;

    if (deltaY > 0) {
      // Prevent page scrolling while dragging sheet
      if (e.cancelable) e.preventDefault();
      setDragY(deltaY);
    } else {
      setDragY(0);
    }
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Dismiss threshold: 100px downwards drag
    if (dragY > 100) {
      setDragY(400);
      setTimeout(() => {
        onClose?.();
      }, 150);
    } else {
      setDragY(0);
    }
  };

  const overlayOpacity = Math.max(0, 1 - dragY / 300);

  return createPortal(
    <div
      className="mobile-modal-overlay"
      onClick={onClose}
      style={{
        backgroundColor: `rgba(0, 0, 0, ${0.65 * overlayOpacity})`,
        backdropFilter: `blur(${12 * overlayOpacity}px)`
      }}
    >
      <div
        ref={sheetRef}
        className={`mobile-modal-sheet ${className}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        style={{
          ...style,
          maxHeight,
          display: 'flex',
          flexDirection: 'column',
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          touchAction: 'none'
        }}
      >
        <div
          className="sheet-handle"
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            padding: '0.4rem 0',
            backgroundClip: 'content-box'
          }}
        />
        {children}
      </div>
    </div>,
    document.body
  );
}
