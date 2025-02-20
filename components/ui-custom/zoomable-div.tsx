import React, { useRef, useState, useEffect } from 'react';

export default function ZoomableDiv({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [transformOrigin, setTransformOrigin] = useState('center center');
  const zoomSensitivity = 0.0015;

  // Utility to prevent extreme zoom-in or zoom-out
  const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Detect Ctrl/Cmd scrolling or pinch gesture on a trackpad
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const outer = outerRef.current;
        if (!outer) return;

        // Get the bounding box of the (untransformed) outer container
        const rect = outer.getBoundingClientRect();

        // Compute pointer offsets in "unscaled" space
        const offsetX = (e.clientX - rect.left) / scale;
        const offsetY = (e.clientY - rect.top) / scale;

        // Update scale
        const newScale = clamp(scale - e.deltaY * zoomSensitivity, 0.5, 4);
        setScale(newScale);

        // Update transform origin to pivot around the cursor
        setTransformOrigin(`${offsetX}px ${offsetY}px`);
      }
    };

    const outer = outerRef.current;
    if (outer) {
      outer.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (outer) {
        outer.removeEventListener('wheel', handleWheel);
      }
    };
  }, [scale]);

  return (
    <div
      ref={outerRef}
      // Outer container scrolls, not scaled
      className="relative overflow-y-auto w-full h-full"
    >
      {/* Inner container is scaled */}
      <div
        style={{
          transformOrigin,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
