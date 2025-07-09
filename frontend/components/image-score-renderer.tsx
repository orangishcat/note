import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import JSZip from "jszip";
import { useQuery } from "@tanstack/react-query";
import ZoomableDiv from "@/components/ui-custom/zoomable-div";
import { ImageScoreRendererProps } from "@/types/score-types";
import api from "@/lib/network";
import { storage } from "@/lib/appwrite";

const cache = new Map<string, string[]>();

// Revoke all cached URLs before page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    cache.forEach((urls) => urls.forEach((u) => URL.revokeObjectURL(u)));
    cache.clear();
  });
}

export default function ImageScoreRenderer({
  scoreId,
  recenter,
  currentPage,
  pagesPerView,
  displayMode = "paged",
}: ImageScoreRendererProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [transitionPage, setTransitionPage] = useState<number | null>(null);
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const [animating, setAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

      cache.set(scoreId, urls);
      return urls;
    },
  });

  const images = data ?? [];
  const totalViews = Math.ceil(images.length / pagesPerView);

  // Clear cache and refetch if any image fails to load
  const handleImageError = useCallback(() => {
    const urls = cache.get(scoreId);
    if (urls) {
      urls.forEach((u) => URL.revokeObjectURL(u));
      cache.delete(scoreId);
    }
    refetch();
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

  // Synchronize with external currentPage
  useEffect(() => {
    if (currentPage !== undefined && currentPage !== pageIndex) {
      startTransition(currentPage);
    }
  }, [currentPage]);

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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (animating) return;
      if (e.key === "ArrowRight") {
        startTransition(Math.min(pageIndex + 1, totalViews - 1));
      } else if (e.key === "ArrowLeft") {
        startTransition(Math.max(pageIndex - 1, 0));
      }
    },
    [animating, pageIndex, startTransition, totalViews],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (animating) return;
      if (Math.abs(e.deltaX) > 20 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (e.deltaX > 0) {
          startTransition(Math.min(pageIndex + 1, totalViews - 1));
        } else {
          startTransition(Math.max(pageIndex - 1, 0));
        }
      }
    },
    [animating, pageIndex, startTransition, totalViews],
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
            {images.map((url, i) => (
              <div
                key={i}
                className="relative"
                style={{ width: "800px", height: "1000px" }}
              >
                <Image
                  src={url}
                  alt={`Score page ${i + 1}`}
                  fill
                  style={{ objectFit: "contain" }}
                  unoptimized
                  onError={handleImageError}
                />
              </div>
            ))}
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
      ref={containerRef}
      className="relative flex h-full flex-col items-center overflow-hidden"
    >
      <ZoomableDiv recenter={recenter}>
        <div
          className="relative"
          style={{
            width: pagesPerView === 2 ? "1600px" : "800px",
            height: "1000px",
          }}
        >
          {transitionPage !== null && animating && (
            <div
              className={`flex ${prevClass}`}
              style={{ width: "100%", height: "100%" }}
            >
              {previousPages.map((url, i) => (
                <div
                  key={`prev-${i}`}
                  className="relative bg-white"
                  style={{
                    width: pagesPerView === 2 ? "800px" : "800px",
                    height: "1000px",
                  }}
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    style={{ objectFit: "contain" }}
                    unoptimized
                    onError={handleImageError}
                  />
                </div>
              ))}
            </div>
          )}
          <div
            className={`flex ${currentClass}`}
            style={{ width: "100%", height: "100%" }}
          >
            {currentPages.map((url, i) => (
              <div
                key={`curr-${i}`}
                className="relative bg-white"
                style={{
                  width: pagesPerView === 2 ? "800px" : "800px",
                  height: "1000px",
                }}
              >
                <Image
                  src={url}
                  alt={`Score page ${pageIndex * pagesPerView + i + 1}`}
                  fill
                  style={{ objectFit: "contain" }}
                  unoptimized
                  onError={handleImageError}
                />
              </div>
            ))}
          </div>
        </div>
      </ZoomableDiv>
    </div>
  );
}
