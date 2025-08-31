"use client";

import React, { useEffect, useRef } from "react";
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

      // center single-page viewer
      container.style.textAlign = displayMode === "scroll" ? "" : "center";

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

      if (!viewerRef.current) {
        log.warn("Viewer not initialized");
      }

      // recenter
      const onRecenter = () => {
        const v = viewerRef.current;
        if (v) v.currentScaleValue = "page-height";
      };
      const recenterBtn = recenter.current;
      recenterBtn?.addEventListener("click", onRecenter);
      cleanupFns.push(
        () => recenterBtn?.removeEventListener("click", onRecenter),
      );

      // zoom handlers (unchanged but use viewerRef.current)
      const onZoomIn = (e: Event) => {
        const ce = e as CustomEvent<{ scoreId?: string }>;
        if (ce.detail?.scoreId && ce.detail.scoreId !== scoreId) return;
        const v = viewerRef.current;
        if (!v) throw new Error("Viewer doesn't exist");
        const cur = v.currentScale;
        v.currentScale = Math.min(5, cur * 1.1);
      };
      const onZoomOut = (e: Event) => {
        const ce = e as CustomEvent<{ scoreId?: string }>;
        if (ce.detail?.scoreId && ce.detail.scoreId !== scoreId) return;
        const v = viewerRef.current;
        if (!v) throw new Error("Viewer doesn't exist");
        const cur = v.currentScale;
        v.currentScale = Math.max(0.1, cur / 1.1);
      };
      const onZoomReset = (e: Event) => {
        const ce = e as CustomEvent<{ scoreId?: string }>;
        if (ce.detail?.scoreId && ce.detail.scoreId !== scoreId) return;
        const v = viewerRef.current;
        if (v) v.currentScaleValue = "page-height";
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
          if (v) v.currentScaleValue = "page-height";
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
        });
      };
      eventBus.on("pagesloaded", onPagesLoaded);
      cleanupFns.push(() => eventBus.off("pagesloaded", onPagesLoaded));
    }

    void init();

    return () => {
      cancelled = true;
      while (cleanupFns.length) {
        try {
          cleanupFns.pop()!();
        } catch {}
      }
    };
  }, [scoreId, recenter, setPage, displayMode]);

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
    if (!viewerRef.current || !pdfDocRef.current) return;
    if (viewerRef.current.pagesCount === 0) return;
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
