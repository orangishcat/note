"use client";

import React, { useEffect, useRef } from "react";
import { ImageScoreRendererProps } from "@/types/score-types";
import api from "@/lib/network";
import { storage } from "@/lib/appwrite";
// Import PDF.js viewer styles
import "pdfjs-dist/web/pdf_viewer.css";

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
  const viewerRef = useRef<any>(null);
  const eventBusRef = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);
  const scrollModeRef = useRef<any>(null);

  // Initialize PDF.js viewer
  useEffect(() => {
    let cancelled = false;
    const cleanupRef: { current: null | (() => void) } = { current: null };

    async function init() {
      // Import core library first and attach to globalThis for the viewer bundle
      const pdfjsLib: any = await import("pdfjs-dist");
      (globalThis as any).pdfjsLib = pdfjsLib;
      // Set worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      // Import the viewer after the global is set
      const pdfjsViewer: any = await import("pdfjs-dist/web/pdf_viewer");

      const container = viewerContainerRef.current!;
      // Clear any previous content
      container.innerHTML = "";
      // Ensure required absolute positioning for PDF.js viewer container
      const cs1 = getComputedStyle(container);
      if (cs1.position !== "absolute") {
        container.style.position = "absolute";
        container.style.top = "0";
        container.style.left = "0";
        container.style.right = "0";
        container.style.bottom = "0";
      }
      if (cs1.overflow !== "auto") {
        container.style.overflow = "auto";
      }

      // Create the viewer root
      const viewerEl = document.createElement("div");
      viewerEl.className = "pdfViewer";
      container.appendChild(viewerEl);

      // Set up viewer components
      const eventBus = new (pdfjsViewer as any).EventBus();
      const linkService = new (pdfjsViewer as any).PDFLinkService({ eventBus });
      const findController = new (pdfjsViewer as any).PDFFindController({
        eventBus,
        linkService,
      });
      // Use single-page viewer for horizontal/paged mode so only one page is shown, centered
      const ViewerCtor =
        displayMode === "scroll"
          ? (pdfjsViewer as any).PDFViewer
          : (pdfjsViewer as any).PDFSinglePageViewer;
      const viewer = new ViewerCtor({
        container,
        eventBus,
        linkService,
        findController,
      });
      // Center the single-page view content by centering the container's inline content
      if (displayMode !== "scroll") {
        container.style.textAlign = "center";
      } else {
        container.style.textAlign = "";
      }
      try {
        const cs = getComputedStyle(container);
        // eslint-disable-next-line no-console
        console.error("pdfjs container init:", {
          position: cs.position,
          hasOffsetParent: !!container.offsetParent,
          rects: container.getClientRects().length,
          w: container.clientWidth,
          h: container.clientHeight,
        });
      } catch {}
      linkService.setViewer(viewer);

      // Load the PDF bytes
      const url = storage.getFileDownload(
        process.env.NEXT_PUBLIC_SCORES_BUCKET!,
        scoreId,
      );
      const res = await api.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
      });
      const loadingTask = pdfjsLib.getDocument({ data: res.data });
      const pdfDocument = await loadingTask.promise;
      pdfDocRef.current = pdfDocument;

      // Set the document only once the container is measurable to avoid scroll errors
      const mountDocument = () => {
        viewer.setDocument(pdfDocument);
        linkService.setDocument(pdfDocument, null);

        // Inform listeners about total pages
        document.dispatchEvent(
          new CustomEvent("score:pageInfo", {
            detail: { totalPages: pdfDocument.numPages, scoreId },
            bubbles: true,
          }),
        );
      };
      // Defer mounting until container is ready
      const waitReady = (cb: () => void, attempts = 20) => {
        const el = viewerContainerRef.current;
        if (!el) return cb();
        const ready = !!el.offsetParent || el.getClientRects().length > 0;
        if (ready) return cb();
        if (attempts <= 0) return cb();
        requestAnimationFrame(() => waitReady(cb, attempts - 1));
      };
      waitReady(mountDocument);

      // Handle page changes to sync external state and fire events
      eventBus.on("pagechanging", (evt: any) => {
        if (cancelled) return;
        const pageNum: number = evt.pageNumber; // 1-based
        const zeroBased = pageNum - 1;
        // Defer state updates to avoid running within viewer layout stack
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
      });

      eventBusRef.current = eventBus;
      viewerRef.current = viewer;

      // Save ScrollMode enum for later and apply after pages initialize
      scrollModeRef.current = (pdfjsViewer as any).ScrollMode;

      // Hook up recenter to reset zoom
      const onRecenter = () => {
        if (viewerRef.current)
          viewerRef.current.currentScaleValue = "page-height";
      };
      const btn = recenter.current;
      btn?.addEventListener("click", onRecenter);

      // Zoom controls via global events, filtered by scoreId
      const onZoomIn = (e: Event) => {
        const ce = e as CustomEvent<{ scoreId?: string }>;
        if (ce.detail?.scoreId && ce.detail.scoreId !== scoreId) return;
        if (!viewerRef.current) return;
        try {
          const cur = viewerRef.current.currentScale || 1;
          viewerRef.current.currentScale = Math.min(5, cur * 1.1);
        } catch {
          // ignore
        }
      };

      const onZoomOut = (e: Event) => {
        const ce = e as CustomEvent<{ scoreId?: string }>;
        if (ce.detail?.scoreId && ce.detail.scoreId !== scoreId) return;
        if (!viewerRef.current) return;
        try {
          const cur = viewerRef.current.currentScale || 1;
          viewerRef.current.currentScale = Math.max(0.1, cur / 1.1);
        } catch {
          // ignore
        }
      };

      const onZoomReset = (e: Event) => {
        const ce = e as CustomEvent<{ scoreId?: string }>;
        if (ce.detail?.scoreId && ce.detail.scoreId !== scoreId) return;
        if (!viewerRef.current) return;
        try {
          viewerRef.current.currentScaleValue = "page-height";
        } catch {
          // ignore
        }
      };

      document.addEventListener("score:zoomIn", onZoomIn as EventListener);
      document.addEventListener("score:zoomOut", onZoomOut as EventListener);
      document.addEventListener(
        "score:zoomReset",
        onZoomReset as EventListener,
      );

      const cleanup = () => {
        btn?.removeEventListener("click", onRecenter);
        document.removeEventListener("score:zoomIn", onZoomIn as EventListener);
        document.removeEventListener(
          "score:zoomOut",
          onZoomOut as EventListener,
        );
        document.removeEventListener(
          "score:zoomReset",
          onZoomReset as EventListener,
        );
      };
      // Helper to wait for container to be laid out (attached and measurable)
      const waitForContainerReady = (cb: () => void, attempts = 10) => {
        const el = viewerContainerRef.current;
        if (!el) return;
        // Consider ready if attached and has non-zero geometry
        const ready = !!el.offsetParent || el.getClientRects().length > 0;
        if (ready) {
          cb();
          return;
        }
        if (attempts <= 0) {
          // Give up but still try to apply without geometry to avoid stalling
          cb();
          return;
        }
        requestAnimationFrame(() => waitForContainerReady(cb, attempts - 1));
      };

      // Apply initial scale once pages are initialized
      eventBus.on("pagesinit", () => {
        const applyScale = () => {
          try {
            viewer.currentScaleValue = "page-height";
          } catch {
            // ignore
          }
        };
        waitForContainerReady(applyScale);
      });

      // Apply scroll mode after pages are fully loaded to avoid early scroll
      eventBus.on("pagesloaded", () => {
        const applyScroll = () => {
          try {
            if (!scrollModeRef.current || !viewerRef.current) return;
            // For single-page viewer, scrollMode is fixed to PAGE; only set when in scroll (multi-page) mode
            if (displayMode === "scroll") {
              viewerRef.current.scrollMode = scrollModeRef.current.VERTICAL;
            }
          } catch {
            // ignore
          }
        };
        waitForContainerReady(applyScroll);
      });

      cleanupRef.current = cleanup;
    }

    void init();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [scoreId, recenter, setPage, displayMode]);

  // Apply scroll mode when displayMode changes
  useEffect(() => {
    if (!viewerRef.current) return;
    try {
      if (!scrollModeRef.current) return;
      const container = viewerContainerRef.current;
      const apply = () => {
        try {
          viewerRef.current.scrollMode =
            displayMode === "scroll"
              ? scrollModeRef.current.VERTICAL
              : scrollModeRef.current.HORIZONTAL;
        } catch {
          // ignore
        }
      };
      if (container && !container.offsetParent) requestAnimationFrame(apply);
      else apply();
    } catch {
      // ignore
    }
  }, [displayMode]);

  // Sync page from external state
  useEffect(() => {
    if (!viewerRef.current || !pdfDocRef.current) return;
    if ((viewerRef.current as any).pagesCount === 0) return;
    const total = pdfDocRef.current.numPages;
    const page = Math.min(Math.max(1, (currentPage ?? 0) + 1), total);
    if (viewerRef.current.currentPageNumber !== page) {
      viewerRef.current.currentPageNumber = page;
    }
  }, [currentPage]);

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
    <div id={`score-${scoreId}`} className="relative h-full w-full">
      <div
        ref={viewerContainerRef}
        className="absolute inset-0 h-full w-full overflow-auto score-container pdfjs-viewer-container"
      />
    </div>
  );
}
