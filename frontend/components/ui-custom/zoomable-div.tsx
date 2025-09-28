import React, {
  RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ZoomContext } from "@/app/providers";
import { usePinch, useWheel } from "@use-gesture/react";
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
  const prevScaleRef = useRef(defaultScale);
  const zoomSensitivity = 0.0015;
  const minScale = 0.25;
  const maxScale = 4;
  const zoomContext = useContext(ZoomContext);
  const scoreIdRef = useRef<string>("");
  useEffect(() => {
    if (outerRef.current) {
      const parentElement = outerRef.current.closest('[id^="score-"]');
      if (parentElement) {
        const id = parentElement.id;
        scoreIdRef.current = id.replace("score-", "");
      }
    }
  }, []);
  useEffect(() => {
    setScale(defaultScale);
    prevScaleRef.current = defaultScale;
  }, [defaultScale]);
  const clamp = (val: number, min: number, max: number) =>
    Math.min(Math.max(val, min), max);
  const [originalWidth, setOriginalWidth] = useState<number | null>(null);
  const [originalHeight, setOriginalHeight] = useState<number | null>(null);
  useEffect(() => {
    if (innerRef.current) {
      const currentWidth = innerRef.current.offsetWidth;
      const screenWidth = window.innerWidth - 6;
      setOriginalWidth(Math.min(currentWidth, screenWidth));
      setOriginalHeight(innerRef.current.offsetHeight);
    }
  }, []);
  useWheel(
    ({ event, delta: [, dy] }) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const newScale = clamp(scale - dy * zoomSensitivity, minScale, maxScale);
      setScale(newScale);
      if (zoomContext && scoreIdRef.current) {
        zoomContext.setZoomLevel(scoreIdRef.current, newScale);
      }
    },
    { target: outerRef, eventOptions: { passive: false } },
  );
  usePinch(
    ({ event, offset: [d] }) => {
      event.preventDefault();
      const newScale = clamp(d, minScale, maxScale);
      setScale(newScale);
      if (zoomContext && scoreIdRef.current) {
        zoomContext.setZoomLevel(scoreIdRef.current, newScale);
      }
    },
    {
      target: outerRef,
      eventOptions: { passive: false },
      pinch: {
        scaleBounds: { min: minScale, max: maxScale },
        from: () => [scale, 0],
      },
    },
  );
  useEffect(() => {
    const handleRecenter = () => {
      const resetScale = 1;
      setScale(resetScale);
      if (zoomContext && scoreIdRef.current) {
        zoomContext.setZoomLevel(scoreIdRef.current, resetScale);
      }
    };
    const btn = recenter.current;
    btn?.addEventListener("click", handleRecenter);
    return () => {
      btn?.removeEventListener("click", handleRecenter);
    };
  }, [recenter, zoomContext]);
  useEffect(() => {
    if (
      !innerRef.current ||
      !outerRef.current ||
      originalWidth === null ||
      originalHeight === null
    )
      return;
    const outer = outerRef.current;
    const inner = innerRef.current;
    const containerHeight = outer.clientHeight;
    const currentScrollTop = outer.scrollTop;
    const centerY = currentScrollTop + containerHeight / 2;
    inner.style.transform = `scale(${scale})`;
    inner.style.transformOrigin = "0 0";
    const newWidth = originalWidth * scale;
    const newHeight = originalHeight * scale;
    inner.style.width = `${newWidth}px`;
    inner.style.height = `${newHeight}px`;
    const prevScale = prevScaleRef.current;
    const newCenterY = centerY * (scale / prevScale);
    outer.scrollTop = newCenterY - containerHeight / 2;
    prevScaleRef.current = scale;
    if (zoomContext && scoreIdRef.current) {
      zoomContext.setZoomLevel(scoreIdRef.current, scale);
    }
    if (onScaleChange) {
      onScaleChange(scale);
    }
  }, [scale, originalWidth, originalHeight, onScaleChange, zoomContext]);
  return (
    <div
      ref={outerRef}
      className="relative h-full overflow-x-hidden overflow-y-auto zoomable-div"
      data-scale={scale}
    >
      <div ref={innerRef} className="zoomable-content">
        {children}
      </div>
    </div>
  );
}
