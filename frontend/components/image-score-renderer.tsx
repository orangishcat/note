"use client";

import React, { useContext, useEffect, useRef } from "react";
import { ImageScoreRendererProps } from "@/types/score-types";
import api from "@/lib/network";
import { storage } from "@/lib/appwrite";
import "pdfjs-dist/web/pdf_viewer.css";
import log from "loglevel";
import type { EventBus } from "pdfjs-dist/types/web/event_utils";
import type { PDFLinkService } from "pdfjs-dist/types/web/pdf_link_service";
import type { PDFFindController } from "pdfjs-dist/types/web/pdf_find_controller";
import type { PDFViewer } from "pdfjs-dist/types/web/pdf_viewer";
import type { ScrollMode } from "pdfjs-dist/types/web/ui_utils";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { ZoomContext } from "@/app/providers";

export default function ImageScoreRenderer({
  scoreId,
  recenter,
  currentPage,
  pagesPerView: _pagesPerView,
  setPage,
  displayMode = "paged",
}: ImageScoreRendererProps) {
  void _pagesPerView;

  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const eventBusRef = useRef<EventBus | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const scrollModeRef = useRef<typeof ScrollMode | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const zoomCtx = useContext(ZoomContext);
  const linkServiceRef = useRef<PDFLinkService | null>(null);

  // Initialize PDF.js viewer
  // helper: is the container measurable?
  function isMeasurable(el: HTMLElement | null) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // wait until measurable (retry a few frames)
  function waitMeasurable(cb: () => void, attempts = 20) {
    const el = viewerContainerRef.current;
    if (!el) return;
    if (isMeasurable(el)) return cb();
    if (attempts <= 0) return cb(); // best effort
    requestAnimationFrame(() => waitMeasurable(cb, attempts - 1));
  }

  useEffect(() => {
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];

    async function init() {
      const pdfjsLib = await import("pdfjs-dist");
      (globalThis as unknown as { pdfjsLib?: unknown }).pdfjsLib = pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      const pdfjsViewer = await import("pdfjs-dist/web/pdf_viewer");

      const container = viewerContainerRef.current!;
      container.innerHTML = "";
      // positioning for offsetParent
      container.style.position = "absolute";
      container.style.inset = "0";
      container.style.overflow = "auto";

      // rely on PDF.js CSS for centering; avoid text-align hacks that skew layout
      container.style.textAlign = "";

      const viewerEl = document.createElement("div");
      viewerEl.className = "pdfViewer";
      container.appendChild(viewerEl);

      const eventBus: EventBus = new pdfjsViewer.EventBus();
      const linkService: PDFLinkService = new pdfjsViewer.PDFLinkService({
        eventBus,
      });
      const findController: PDFFindController =
        new pdfjsViewer.PDFFindController({ eventBus, linkService });

      const viewer: PDFViewer =
        displayMode === "scroll"
          ? new pdfjsViewer.PDFViewer({
              container,
              eventBus,
              linkService,
              findController,
            })
          : new (
              pdfjsViewer as unknown as {
                PDFSinglePageViewer: new (
                  opts: ConstructorParameters<typeof pdfjsViewer.PDFViewer>[0],
                ) => PDFViewer;
              }
            ).PDFSinglePageViewer({
              container,
              eventBus,
              linkService,
              findController,
            });

      linkService.setViewer(viewer);
      linkServiceRef.current = linkService;

      // load pdf
      const url = storage.getFileDownload(
        process.env.NEXT_PUBLIC_SCORES_BUCKET!,
        scoreId,
      );
      const res = await api.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
      });
      const loadingTask = pdfjsLib.getDocument({ data: res.data });
      const pdfDocument: PDFDocumentProxy = await loadingTask.promise;
      pdfDocRef.current = pdfDocument;

      // mount when measurable
      waitMeasurable(() => {
        if (cancelled) return;
        viewer.setDocument(pdfDocument);
        linkService.setDocument(pdfDocument, null);
        document.dispatchEvent(
          new CustomEvent("score:pageInfo", {
            detail: { totalPages: pdfDocument.numPages, scoreId },
            bubbles: true,
          }),
        );
      });

      eventBusRef.current = eventBus;
      viewerRef.current = viewer;
      scrollModeRef.current = pdfjsViewer.ScrollMode;

      try {
        const g =
          (window as any).__pdfViewers || ((window as any).__pdfViewers = {});
        g[scoreId] = viewer;
      } catch {}

      if (!viewerRef.current) {
        log.warn("Viewer not initialized");
      }

      // recenter handled in separate effect to ensure button is present

      // zoom handlers (update viewer scale and trigger redraw)
      const onZoomIn = (e: Event) => {
        const ce = e as CustomEvent<{ scoreId?: string }>;
        if (ce.detail?.scoreId && ce.detail.scoreId !== scoreId) return;
        const v = viewerRef.current;
        if (!v) throw new Error("Viewer doesn't exist");
        const cur = v.currentScale;
        const next = Math.min(5, cur * 1.1);
        // Prefer setting via currentScaleValue for cross-browser consistency
        (v as any).currentScaleValue = next;
        // Update zoom context + redraw
        zoomCtx?.setZoomLevel(scoreId, next);
        document.dispatchEvent(
          new CustomEvent("score:redrawAnnotations", { bubbles: true }),
        );
      };
      const onZoomOut = (e: Event) => {
        const ce = e as CustomEvent<{ scoreId?: string }>;
        if (ce.detail?.scoreId && ce.detail.scoreId !== scoreId) return;
        const v = viewerRef.current;
        if (!v) throw new Error("Viewer doesn't exist");
        const cur = v.currentScale;
        const next = Math.max(0.1, cur / 1.1);
        (v as any).currentScaleValue = next;
        zoomCtx?.setZoomLevel(scoreId, next);
        document.dispatchEvent(
          new CustomEvent("score:redrawAnnotations", { bubbles: true }),
        );
      };
      const onZoomReset = (e: Event) => {
        const ce = e as CustomEvent<{ scoreId?: string }>;
        if (ce.detail?.scoreId && ce.detail.scoreId !== scoreId) return;
        const v = viewerRef.current;
        if (v) (v as any).currentScaleValue = "page-fit";
        // After resetting, let pagesinit/pagesloaded settle, but update context heuristically
        // We'll also listen to scalechanging below for authoritative updates
        if (v) {
          const s = v.currentScale;
          zoomCtx?.setZoomLevel(scoreId, s);
        }
        document.dispatchEvent(
          new CustomEvent("score:redrawAnnotations", { bubbles: true }),
        );
      };

      document.addEventListener("score:zoomIn", onZoomIn as EventListener);
      document.addEventListener("score:zoomOut", onZoomOut as EventListener);
      document.addEventListener(
        "score:zoomReset",
        onZoomReset as EventListener,
      );
      cleanupFns.push(() => {
        document.removeEventListener("score:zoomIn", onZoomIn as EventListener);
        document.removeEventListener(
          "score:zoomOut",
          onZoomOut as EventListener,
        );
        document.removeEventListener(
          "score:zoomReset",
          onZoomReset as EventListener,
        );
      });

      // page events
      const onPageChanging = (evt: { pageNumber: number }) => {
        if (cancelled) return;
        const zeroBased = evt.pageNumber - 1;
        setTimeout(() => {
          setPage(zeroBased);
          document.dispatchEvent(
            new CustomEvent("score:pageChange", {
              detail: { currentPage: zeroBased, scoreId },
              bubbles: true,
            }),
          );
          document.dispatchEvent(
            new CustomEvent("score:redrawAnnotations", { bubbles: true }),
          );
        }, 0);
      };
      eventBus.on("pagechanging", onPageChanging);
      cleanupFns.push(() => eventBus.off("pagechanging", onPageChanging));

      // apply initial scale when measurable after pagesinit
      const onPagesInit = () => {
        waitMeasurable(() => {
          const v = viewerRef.current;
          if (v) (v as any).currentScaleValue = "page-fit";
          if (v) zoomCtx?.setZoomLevel(scoreId, v.currentScale ?? 1);
          document.dispatchEvent(
            new CustomEvent("score:redrawAnnotations", { bubbles: true }),
          );
        });
      };
      eventBus.on("pagesinit", onPagesInit);
      cleanupFns.push(() => eventBus.off("pagesinit", onPagesInit));

      // apply scroll mode after pages loaded
      const onPagesLoaded = () => {
        waitMeasurable(() => {
          const v = viewerRef.current;
          if (!v || !scrollModeRef.current) return;
          if (displayMode === "scroll")
            v.scrollMode = scrollModeRef.current.VERTICAL;
          // Initialize zoom context once pages are loaded
          zoomCtx?.setZoomLevel(scoreId, v.currentScale ?? 1);
          document.dispatchEvent(
            new CustomEvent("score:redrawAnnotations", { bubbles: true }),
          );
        });
      };
      eventBus.on("pagesloaded", onPagesLoaded);
      cleanupFns.push(() => eventBus.off("pagesloaded", onPagesLoaded));

      // keep ZoomContext in sync with PDF.js zoom and trigger redraws
      const onScaleChanging = (evt: {
        scale: number;
        presetValue?: unknown;
      }) => {
        if (cancelled) return;
        const newScale = evt ? evt.scale : viewerRef.current?.currentScale ?? 1;
        zoomCtx?.setZoomLevel(scoreId, newScale);
        document.dispatchEvent(
          new CustomEvent("score:redrawAnnotations", { bubbles: true }),
        );
      };
      eventBus.on("scalechanging", onScaleChanging as any);
      cleanupFns.push(() =>
        eventBus.off("scalechanging", onScaleChanging as any),
      );
      // Also listen to scalechange for completeness
      const onScaleChange2 = () => {
        if (cancelled) return;
        const v = viewerRef.current;
        if (!v) return;
        zoomCtx?.setZoomLevel(scoreId, v.currentScale ?? 1);
        document.dispatchEvent(
          new CustomEvent("score:redrawAnnotations", { bubbles: true }),
        );
      };
      eventBus.on("scalechange", onScaleChange2 as any);
      cleanupFns.push(() => eventBus.off("scalechange", onScaleChange2 as any));
    }

    void init();

    return () => {
      cancelled = true;
      while (cleanupFns.length) {
        try {
          cleanupFns.pop()!();
        } catch {}
      }
      try {
        const g = (window as any).__pdfViewers;
        if (g && g[scoreId]) delete g[scoreId];
      } catch {}
    };
  }, [scoreId, recenter, setPage, displayMode]);

  // Keyboard shortcuts: page nav, zoom, fullscreen
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const v = viewerRef.current;
      if (!v) return;
      // Avoid interfering with inputs/contenteditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key;
      if (key === "ArrowLeft") {
        e.preventDefault();
        const prev = Math.max(1, v.currentPageNumber - 1);
        if (prev !== v.currentPageNumber) v.currentPageNumber = prev;
      } else if (key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(
          v.pagesCount || (pdfDocRef.current?.numPages ?? Infinity),
          v.currentPageNumber + 1,
        );
        if (next !== v.currentPageNumber) v.currentPageNumber = next;
      } else if (key === "+" || key === "=") {
        e.preventDefault();
        const cur = v.currentScale;
        const next = Math.min(5, cur * 1.1);
        (v as any).currentScaleValue = next;
        zoomCtx?.setZoomLevel(scoreId, next);
        document.dispatchEvent(
          new CustomEvent("score:redrawAnnotations", { bubbles: true }),
        );
      } else if (key === "-" || key === "_") {
        e.preventDefault();
        const cur = v.currentScale;
        const next = Math.max(0.1, cur / 1.1);
        (v as any).currentScaleValue = next;
        zoomCtx?.setZoomLevel(scoreId, next);
        document.dispatchEvent(
          new CustomEvent("score:redrawAnnotations", { bubbles: true }),
        );
      } else if (key.toLowerCase() === "f") {
        // Toggle fullscreen on wrapper
        const wrap = wrapperRef.current;
        if (!wrap) return;
        e.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void wrap.requestFullscreen();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Touch gestures: pinch to zoom, swipe to change pages
  useEffect(() => {
    const container = viewerContainerRef.current;
    if (!container) return;
    const v = viewerRef.current;
    if (!v) return;

    let isPinching = false;
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let swipeStartX = 0;
    let swipeStartY = 0;
    let isSwiping = false;

    const dist2 = (t1: Touch, t2: Touch) => {
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isPinching = true;
        pinchStartDist = dist2(e.touches[0], e.touches[1]);
        pinchStartScale = viewerRef.current?.currentScale ?? 1;
      } else if (e.touches.length === 1) {
        isSwiping = true;
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isPinching && e.touches.length >= 2) {
        const currentDist = dist2(e.touches[0], e.touches[1]);
        const ratio = currentDist / Math.max(1, pinchStartDist);
        const base = pinchStartScale;
        const newScale = Math.min(5, Math.max(0.1, base * ratio));
        const viewer = viewerRef.current;
        if (viewer) {
          (viewer as any).currentScaleValue = newScale;
          zoomCtx?.setZoomLevel(scoreId, newScale);
          document.dispatchEvent(
            new CustomEvent("score:redrawAnnotations", { bubbles: true }),
          );
        }
        // Prevent page scroll/zoom while pinching
        e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isPinching && e.touches.length < 2) {
        isPinching = false;
      }
      if (isSwiping && e.touches.length === 0) {
        const endX =
          (e.changedTouches && e.changedTouches[0]?.clientX) ?? swipeStartX;
        const endY =
          (e.changedTouches && e.changedTouches[0]?.clientY) ?? swipeStartY;
        const dx = endX - swipeStartX;
        const dy = endY - swipeStartY;
        const THRESH = 50;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > THRESH) {
          const viewer = viewerRef.current;
          if (viewer) {
            if (dx < 0) {
              // swipe left -> next page
              const next = Math.min(
                viewer.pagesCount || (pdfDocRef.current?.numPages ?? Infinity),
                viewer.currentPageNumber + 1,
              );
              if (next !== viewer.currentPageNumber)
                viewer.currentPageNumber = next;
            } else {
              // swipe right -> prev page
              const prev = Math.max(1, viewer.currentPageNumber - 1);
              if (prev !== viewer.currentPageNumber)
                viewer.currentPageNumber = prev;
            }
          }
        }
        isSwiping = false;
      }
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener(
        "touchstart",
        onTouchStart as EventListener,
      );
      container.removeEventListener("touchmove", onTouchMove as EventListener);
      container.removeEventListener("touchend", onTouchEnd as EventListener);
      container.removeEventListener("touchcancel", onTouchEnd as EventListener);
    };
  }, [viewerContainerRef]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !scrollModeRef.current) return;
    const container = viewerContainerRef.current;
    const apply = () => {
      const v2 = viewerRef.current;
      if (!v2) return;
      v2.scrollMode =
        displayMode === "scroll"
          ? scrollModeRef.current!.VERTICAL
          : scrollModeRef.current!.HORIZONTAL;
    };
    if (container && !isMeasurable(container)) {
      requestAnimationFrame(apply);
    } else {
      apply();
    }
  }, [displayMode]);

  // Sync page from external state
  useEffect(() => {
    const trySetPage = (attempts = 20) => {
      const v = viewerRef.current;
      const doc = pdfDocRef.current;
      if (!v || !doc) return;
      if (v.pagesCount === 0) {
        if (attempts > 0) requestAnimationFrame(() => trySetPage(attempts - 1));
        return;
      }
      const total = doc.numPages;
      const pageNum = Math.min(Math.max(1, (currentPage ?? 0) + 1), total);
      if (v.currentPageNumber !== pageNum) {
        // Prefer linkService for reliable navigation in all viewer modes
        const ls = linkServiceRef.current;
        if (ls && typeof (ls as any).goToPage === "function") {
          (ls as any).goToPage(pageNum);
        } else {
          v.currentPageNumber = pageNum;
        }
      }
    };
    trySetPage();
  }, [currentPage]);

  // Attach recenter click when the button becomes available
  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | null = null;

    const tryAttach = () => {
      if (disposed) return;
      const btn = recenter.current;
      if (!btn) return;
      const onRecenter = () => {
        const v = viewerRef.current;
        if (v) {
          (v as any).currentScaleValue = "page-fit";
          zoomCtx?.setZoomLevel(scoreId, v.currentScale ?? 1);
          document.dispatchEvent(
            new CustomEvent("score:redrawAnnotations", { bubbles: true }),
          );
        }
      };
      btn.addEventListener("click", onRecenter);
      remove = () => btn.removeEventListener("click", onRecenter);
      return true;
    };

    if (!tryAttach()) {
      const id = setInterval(() => {
        if (tryAttach()) clearInterval(id);
      }, 50);
      return () => {
        disposed = true;
        clearInterval(id);
        remove?.();
      };
    }
    return () => {
      disposed = true;
      remove?.();
    };
  }, [recenter]);

  // Redraw annotations when necessary
  useEffect(() => {
    const handler = () => {
      document.dispatchEvent(
        new CustomEvent("score:redrawAnnotations", { bubbles: true }),
      );
    };
    handler();
  }, []);

  return (
    <div
      id={`score-${scoreId}`}
      ref={wrapperRef}
      className="relative h-full w-full"
    >
      <div
        ref={viewerContainerRef}
        className="absolute inset-0 h-full w-full overflow-auto score-container pdfjs-viewer-container"
      />
    </div>
  );
}
