import React, { RefObject, useEffect, useRef, useState } from 'react';

export default function ZoomableDiv({
  children,
  recenter,
  onScaleChange,
  defaultScale = 1,
}: {
  children: React.ReactNode;
  recenter: RefObject<HTMLButtonElement>;
  onScaleChange?: (scale: number) => void;
  defaultScale?: number;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(defaultScale);
  // Track the previous scale so we can compute relative changes.
  const prevScaleRef = useRef(defaultScale);
  const zoomSensitivity = 0.0015;
  const minScale = 0.25;
  const maxScale = 4;

  // Update scale when defaultScale changes
  useEffect(() => {
    setScale(defaultScale);
    prevScaleRef.current = defaultScale;
  }, [defaultScale]);

  // Utility to clamp scale value.
  const clamp = (val: number, min: number, max: number) =>
    Math.min(Math.max(val, min), max);

  // Store the original (unscaled) dimensions of the inner container.
  const [originalWidth, setOriginalWidth] = useState<number | null>(null);
  const [originalHeight, setOriginalHeight] = useState<number | null>(null);

  // On mount, capture the original dimensions and set width to the minimum of the current width and (screen width - 6px)
  useEffect(() => {
    if (innerRef.current) {
      const currentWidth = innerRef.current.offsetWidth;
      const screenWidth = window.innerWidth - 6;
      setOriginalWidth(Math.min(currentWidth, screenWidth));
      setOriginalHeight(innerRef.current.offsetHeight);
    }
  }, []);

  // Handle wheel events (Ctrl/Cmd+wheel for zoom) and recenter button click.
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const newScale = clamp(scale - e.deltaY * zoomSensitivity, minScale, maxScale);
        setScale(newScale);
      }
    };

    const handleRecenter = () => setScale(defaultScale);

    const outer = outerRef.current;
    if (outer) {
      outer.addEventListener('wheel', handleWheel, { passive: false });
    }
    
    recenter.current?.addEventListener('click', handleRecenter);
    
    return () => {
      if (outer) {
        outer.removeEventListener('wheel', handleWheel);
      }
      recenter.current?.removeEventListener('click', handleRecenter);
    };
  }, [recenter, scale, defaultScale]);

  // When scale changes, update the transform, recalc dimensions, and adjust scroll so that the center remains.
  useEffect(() => {
    if (!innerRef.current || !outerRef.current || originalWidth === null || originalHeight === null) return;
    const outer = outerRef.current;
    const inner = innerRef.current;

    // Capture the vertical center of the visible area.
    const containerHeight = outer.clientHeight;
    const currentScrollTop = outer.scrollTop;
    const centerY = currentScrollTop + containerHeight / 2;

    // Apply the scaling transform with origin at the top-left.
    inner.style.transform = `scale(${scale})`;
    inner.style.transformOrigin = '0 0';

    // Calculate new effective dimensions.
    const newWidth = originalWidth * scale;
    const newHeight = originalHeight * scale;

    // Update inner container's size so that the scrollable area reflects the new dimensions.
    inner.style.width = `${newWidth}px`;
    inner.style.height = `${newHeight}px`;

    // Compute the new center by applying the scale change relative to the previous scale.
    const prevScale = prevScaleRef.current;
    const newCenterY = centerY * (scale / prevScale);

    // Adjust scrollTop so that the content center remains constant.
    outer.scrollTop = newCenterY - containerHeight / 2;

    // Update previous scale.
    prevScaleRef.current = scale;
    
    // Notify parent component about scale change if the callback is provided
    if (onScaleChange) {
      onScaleChange(scale);
    }
  }, [scale, originalWidth, originalHeight, onScaleChange]);

  return (
    <div ref={outerRef} className="relative h-full overflow-x-hidden overflow-y-auto">
      <div ref={innerRef}>
        {children}
      </div>
    </div>
  );
}
