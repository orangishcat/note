"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { ImageScoreRendererProps } from "@/types/score-types";
import api from "@/lib/network";
import { storage } from "@/lib/appwrite";
import "pdfjs-dist/web/pdf_viewer.css";
import log from "loglevel";
import type { EventBus } from "pdfjs-dist/types/web/event_utils";
import type { PDFLinkService } from "pdfjs-dist/types/web/pdf_link_service";
import type { PDFFindController } from "pdfjs-dist/types/web/pdf_find_controller";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

export default function ImageScoreRenderer({
  scoreId,
  recenter,
  currentPage,
  setPage,
  pagesPerView: _pagesPerView,
  displayMode = "paged",
  verticalLoading,
  editList,
  confidenceFilter,
  onCanvasWrappersChange,
}: ImageScoreRendererProps) {
  void _pagesPerView;
  void displayMode;
  void verticalLoading;
  void editList;
  void confidenceFilter;

  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerElRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const linkServiceRef = useRef<PDFLinkService | null>(null);

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

  function setPDFPage(page: number | null) {
    const v = linkServiceRef.current?.pdfViewer;
    const doc = pdfDocRef.current;
    if (!v || !doc) return;
    const total = doc.numPages;
    const pageNum = Math.min(Math.max(1, (page ?? 0) + 1), total);
    const ls = linkServiceRef.current;
    log.trace("Navigating to page", pageNum);
    if (ls?.goToPage) ls.goToPage(pageNum);
    else v.currentPageNumber = pageNum;
  }

  useLayoutEffect(() => {
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];

    async function init() {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      const pdfjsViewer = await import("pdfjs-dist/web/pdf_viewer");
      const container = viewerContainerRef.current;
      const viewerEl = viewerElRef.current;
      if (!container || !viewerEl) return;
      if (!container.isConnected || !viewerEl.isConnected) return;

      const eventBus: EventBus = new pdfjsViewer.EventBus();
      const linkService: PDFLinkService = new pdfjsViewer.PDFLinkService({
        eventBus,
      });
      const findController: PDFFindController =
        new pdfjsViewer.PDFFindController({ eventBus, linkService });

      const viewer = new pdfjsViewer.PDFViewer({
        container,
        viewer: viewerEl,
        eventBus,
        linkService,
        findController,
      });

      linkService.setViewer(viewer);
      linkServiceRef.current = linkService;

      // load pdf
      const url = storage.getFileDownload({
        bucketId: process.env.NEXT_PUBLIC_SCORES_BUCKET!,
        fileId: scoreId,
      });
      const res = await api.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
      });
      const loadingTask = pdfjsLib.getDocument({ data: res.data });
      const pdfDocument: PDFDocumentProxy = await loadingTask.promise;
      pdfDocRef.current = pdfDocument;

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

      // Minimal zoom reset: fit to height
      const onZoomReset = () => {
        log.debug("Resetting zoom");
        const v = linkServiceRef.current?.pdfViewer;
        if (v) v.currentScaleValue = "page-height";
      };

      document.addEventListener(
        "score:zoomReset",
        onZoomReset as EventListener,
      );
      cleanupFns.push(() => {
        document.removeEventListener(
          "score:zoomReset",
          onZoomReset as EventListener,
        );
      });

      const onPageChanging = (evt: { pageNumber: number }) => {
        if (cancelled) return;
        setTimeout(() => setPage(evt.pageNumber - 1), 0);
      };
      eventBus.on("pagechanging", onPageChanging);
      cleanupFns.push(() => eventBus.off("pagechanging", onPageChanging));

      const onPagesInit = () => {
        const v = linkServiceRef.current?.pdfViewer;
        if (v) v.currentScaleValue = "page-height";
      };

      eventBus.on("pagesinit", onPagesInit);
      cleanupFns.push(() => eventBus.off("pagesinit", onPagesInit));

      const onPagesLoaded = () => setPDFPage(currentPage);
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
      pdfDocRef.current = null;
      linkServiceRef.current = null;
    };
  }, [scoreId, recenter, displayMode]);

  useEffect(() => {
    const viewerEl = viewerElRef.current;
    if (!viewerEl || !onCanvasWrappersChange) return;

    const emitWrappers = () => {
      const wrappers = Array.from(
        viewerEl.querySelectorAll<HTMLElement>(".canvasWrapper"),
      ).filter(
        (node): node is HTMLDivElement => node instanceof HTMLDivElement,
      );
      onCanvasWrappersChange(wrappers);
    };

    emitWrappers();

    const observer = new MutationObserver(emitWrappers);
    observer.observe(viewerEl, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      onCanvasWrappersChange([]);
    };
  }, [onCanvasWrappersChange]);

  const CLAMP = (n: number, lo = 0.1, hi = 5) => Math.min(hi, Math.max(lo, n));

  const onZoomIn = useCallback(() => {
    const v = linkServiceRef.current?.pdfViewer;
    if (!v) return;
    const prev = v.currentScale;
    const next = CLAMP(prev * 1.1);
    v.currentScale = next;
    log.debug("Zooming in ->", next, "(prev:", prev, ")");
    requestAnimationFrame(() => log.debug("effective scale:", v.currentScale));
  }, []);

  const onZoomOut = useCallback(() => {
    const v = linkServiceRef.current?.pdfViewer;
    if (!v) return;
    const prev = v.currentScale;
    const next = CLAMP(prev / 1.1);
    v.currentScale = next;
    log.debug("Zooming in ->", next, "(prev:", prev, ")");
    requestAnimationFrame(() => log.debug("effective scale:", v.currentScale));
  }, []);

  useEffect(() => {
    window.addEventListener("score:zoomIn", onZoomIn);
    window.addEventListener("score:zoomOut", onZoomOut);

    return () => {
      window.removeEventListener("score:zoomIn", onZoomIn);
      window.removeEventListener("score:zoomOut", onZoomOut);
    };
  }, []);

  useEffect(() => setPDFPage(currentPage), [currentPage]);

  // Attach recenter click when the button becomes available
  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | null = null;

    const tryAttach = () => {
      if (disposed) return;
      const btn = recenter.current;
      if (!btn) return;
      const onRecenter = () => {
        const v = linkServiceRef.current?.pdfViewer;
        if (v) {
          v.currentScaleValue = "page-height";
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

  return (
    <div
      id={`score-${scoreId}`}
      ref={wrapperRef}
      className="relative h-full w-full"
    >
      <div
        ref={viewerContainerRef}
        className="viewerContainer absolute inset-0 h-full w-full overflow-auto score-container pdfjs-viewer-container"
      >
        <div ref={viewerElRef} className="pdfViewer" />
      </div>
    </div>
  );
}
