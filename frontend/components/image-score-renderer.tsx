import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import JSZip from "jszip";
import { useQuery } from "@tanstack/react-query";
import ZoomableDiv from "@/components/ui-custom/zoomable-div";
import { ImageScoreRendererProps } from "@/types/score-types";
import api from "@/lib/network";
import { storage } from "@/lib/appwrite";
import { ZoomContext } from "@/app/providers";

interface ImageData {
  url: string;
  width: number;
  height: number;
}

const cache = new Map<string, ImageData[]>();

// Utility function to load image and get its dimensions
const loadImageDimensions = (
  url: string,
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = url;
  });
};

// Revoke all cached URLs before page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    cache.forEach((imageData) =>
      imageData.forEach((data) => URL.revokeObjectURL(data.url)),
    );
    cache.clear();
  });
}

export default function ImageScoreRenderer({
  scoreId,
  recenter,
  currentPage,
  pagesPerView,
  setPage,
  displayMode = "paged",
}: ImageScoreRendererProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [transitionPage, setTransitionPage] = useState<number | null>(null);
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const [animating, setAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const zoomCtx = useContext(ZoomContext);
  if (!zoomCtx) throw new Error("Zoom context missing");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["image-score", scoreId],
    queryFn: async () => {
      if (cache.has(scoreId)) return cache.get(scoreId)!;
      const url = storage.getFileDownload(
        process.env.NEXT_PUBLIC_SCORES_BUCKET!,
        scoreId,
      );
      const res = await api.get(url, { responseType: "blob" });
      const blob = res.data as Blob;
      const urls: string[] = [];

      if (blob.type === "application/zip") {
        const zip = await JSZip.loadAsync(blob);
        const files = Object.keys(zip.files)
          .filter((f) => /\.(png|jpe?g|gif)$/i.test(f))
          .sort();
        for (const f of files) {
          const b = await zip.files[f].async("blob");
          urls.push(URL.createObjectURL(b));
        }
      } else if (blob.type.startsWith("image/")) {
        urls.push(URL.createObjectURL(blob));
      } else {
        throw new Error("Unsupported file type");
      }

      // Load dimensions for each image
      const imageData: ImageData[] = [];
      for (const url of urls) {
        try {
          const dimensions = await loadImageDimensions(url);
          imageData.push({
            url,
            width: dimensions.width,
            height: dimensions.height,
          });
        } catch {
          // If we can't load dimensions, use default aspect ratio (4:5 like the original 800x1000)
          imageData.push({
            url,
            width: 800,
            height: 1000,
          });
        }
      }

      cache.set(scoreId, imageData);
      return imageData;
    },
  });

  const images = useMemo(() => data ?? [], [data]);
  const totalViews = Math.ceil(images.length / pagesPerView);

  // Calculate container dimensions based on image aspect ratios
  const getContainerDimensions = useCallback(
    (imageData: ImageData[], maxWidth = 800) => {
      if (imageData.length === 0) return { width: maxWidth, height: 1000 };

      // For single page view, use the image's aspect ratio
      if (pagesPerView === 1) {
        const img = imageData[0];
        const aspectRatio = img.width / img.height;
        const width = maxWidth;
        const height = width / aspectRatio;
        return { width, height };
      }

      // For dual page view, calculate based on both images
      let totalWidth = 0;
      let maxHeight = 0;

      for (const img of imageData) {
        const aspectRatio = img.width / img.height;
        const width = maxWidth / 2; // Split available width between pages
        const height = width / aspectRatio;
        totalWidth += width;
        maxHeight = Math.max(maxHeight, height);
      }

      return { width: totalWidth, height: maxHeight };
    },
    [pagesPerView],
  );

  // Clear cache and refetch if any image fails to load
  const handleImageError = useCallback(() => {
    const imageData = cache.get(scoreId);
    if (imageData) {
      imageData.forEach((data) => URL.revokeObjectURL(data.url));
      cache.delete(scoreId);
    }
    void refetch();
  }, [scoreId, refetch]);

  // Inform parent about total pages
  useEffect(() => {
    if (images.length) {
      const ev = new CustomEvent("score:pageInfo", {
        detail: { totalPages: images.length, scoreId },
        bubbles: true,
      });
      document.dispatchEvent(ev);
    }
  }, [images, scoreId]);

  // Emit page change event
  useEffect(() => {
    const ev = new CustomEvent("score:pageChange", {
      detail: { currentPage: pageIndex, scoreId },
      bubbles: true,
    });
    document.dispatchEvent(ev);
  }, [pageIndex, scoreId]);

  const startTransition = useCallback(
    (newIndex: number) => {
      if (newIndex === pageIndex || newIndex < 0 || newIndex >= totalViews) {
        return;
      }
      setTransitionPage(pageIndex);
      setPageIndex(newIndex);
      setDirection(newIndex > pageIndex ? "next" : "prev");
      setAnimating(true);
      setTimeout(() => {
        setAnimating(false);
        setTransitionPage(null);
      }, 300);
    },
    [pageIndex, totalViews],
  );

  // Synchronize with external currentPage
  useEffect(() => {
    if (currentPage !== undefined && currentPage !== pageIndex) {
      startTransition(currentPage);
    }
  }, [currentPage, pageIndex, startTransition]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (animating) return;
      if (e.key === "ArrowRight") {
        setPage(Math.min(pageIndex + 1, totalViews - 1));
      } else if (e.key === "ArrowLeft") {
        setPage(Math.max(pageIndex - 1, 0));
      } else if (e.key === "=" || e.key === "+") {
        // Zoom in: increase zoom level by 0.1, with max limit of 4
        const currentZoom = zoomCtx.getZoomLevel(scoreId);
        const newZoom = Math.min(currentZoom + 0.1, 4);
        zoomCtx.setZoomLevel(scoreId, newZoom);
      } else if (e.key === "-") {
        // Zoom out: decrease zoom level by 0.1, with min limit of 0.25
        const currentZoom = zoomCtx.getZoomLevel(scoreId);
        const newZoom = Math.max(currentZoom - 0.1, 0.25);
        zoomCtx.setZoomLevel(scoreId, newZoom);
      }
    },
    [animating, pageIndex, setPage, totalViews, scoreId, zoomCtx],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (animating) return;
      if (Math.abs(e.deltaX) > 20 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (e.deltaX > 0) {
          setPage(Math.min(pageIndex + 1, totalViews - 1));
        } else {
          setPage(Math.max(pageIndex - 1, 0));
        }
      }
    },
    [animating, pageIndex, setPage, totalViews],
  );

  useEffect(() => {
    const container = containerRef.current;
    container?.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      container?.removeEventListener("wheel", handleWheel);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleWheel, handleKeyDown]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">Loading...</div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p>Failed to load score.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded bg-primary px-2 py-1 text-primary-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  if (displayMode === "scroll") {
    return (
      <div
        ref={containerRef}
        className="flex h-full flex-col items-center overflow-y-auto"
      >
        <ZoomableDiv recenter={recenter}>
          <div className="flex flex-col items-center bg-white">
            {images.map((imageData, i) => {
              const aspectRatio = imageData.width / imageData.height;
              const width = 800;
              const height = width / aspectRatio;

              return (
                <div
                  key={i}
                  className="relative"
                  style={{ width: `${width}px`, height: `${height}px` }}
                >
                  <Image
                    src={imageData.url || "null"}
                    alt={`Score page ${i + 1}`}
                    fill
                    style={{ objectFit: "contain" }}
                    unoptimized
                    onError={handleImageError}
                  />
                </div>
              );
            })}
          </div>
        </ZoomableDiv>
      </div>
    );
  }

  const currentPages = images.slice(
    pageIndex * pagesPerView,
    pageIndex * pagesPerView + pagesPerView,
  );
  const previousPages =
    transitionPage !== null
      ? images.slice(
          transitionPage * pagesPerView,
          transitionPage * pagesPerView + pagesPerView,
        )
      : [];

  // Calculate container dimensions for current pages
  const containerDimensions = getContainerDimensions(currentPages);

  const currentClass = animating
    ? direction === "next"
      ? "animate-slide-in-right"
      : "animate-slide-in-left"
    : "";
  const prevClass = animating
    ? direction === "next"
      ? "animate-slide-out-left"
      : "animate-slide-out-right"
    : "";

  return (
    <div
      id={`score-${scoreId}`}
      ref={wrapperRef}
      className="relative flex h-full flex-col items-center overflow-hidden"
    >
      <ZoomableDiv recenter={recenter}>
        <div
          ref={containerRef}
          className="score-container relative"
          style={{
            width: `${containerDimensions.width}px`,
            height: `${containerDimensions.height}px`,
          }}
        >
          {transitionPage !== null && animating && (
            <div
              className={`flex ${prevClass}`}
              style={{ width: "100%", height: "100%" }}
            >
              {previousPages.map((imageData, i) => {
                const aspectRatio = imageData.width / imageData.height;
                const width =
                  pagesPerView === 2
                    ? containerDimensions.width / 2
                    : containerDimensions.width;
                const height = width / aspectRatio;

                return (
                  <div
                    key={`prev-${i}`}
                    className="relative bg-white"
                    style={{
                      width: `${width}px`,
                      height: `${height}px`,
                    }}
                  >
                    <Image
                      src={imageData.url || "null"}
                      alt=""
                      fill
                      style={{ objectFit: "contain" }}
                      unoptimized
                      onError={handleImageError}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div
            className={`flex ${currentClass}`}
            style={{ width: "100%", height: "100%" }}
          >
            {currentPages.map((imageData, i) => {
              const aspectRatio = imageData.width / imageData.height;
              const width =
                pagesPerView === 2
                  ? containerDimensions.width / 2
                  : containerDimensions.width;
              const height = width / aspectRatio;

              return (
                <div
                  key={`curr-${i}`}
                  className="relative bg-white"
                  style={{
                    width: `${width}px`,
                    height: `${height}px`,
                  }}
                >
                  <Image
                    src={imageData.url || "null"}
                    alt={`Score page ${pageIndex * pagesPerView + i + 1}`}
                    fill
                    style={{ objectFit: "contain" }}
                    unoptimized
                    onError={handleImageError}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </ZoomableDiv>
    </div>
  );
}
