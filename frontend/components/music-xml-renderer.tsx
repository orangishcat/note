import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  GraphicalNote,
  IOSMDOptions,
  OpenSheetMusicDisplay,
} from "opensheetmusicdisplay";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { storage } from "@/lib/appwrite";
import { MusicXMLRendererProps } from "@/types/score-types";
import log from "loglevel";

export default function MusicXMLRenderer({
  scoreId,
  recenter,
  retry,
  currentPage,
}: MusicXMLRendererProps) {
  const debug = !!localStorage.getItem("debug");
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [, setTotalPages] = useState<number>(1);
  const [musicLines, setMusicLines] = useState<Element[]>([]);
  const linesPerPage = 4; // Number of music lines per page
  const lineHeight = useRef<number>(0);
  const pageMargin = 20; // Margin in pixels between pages
  const hasRenderedRef = useRef<boolean>(false); // Track if initial render is complete

  // Calculate total pages once music lines are detected
  useEffect(() => {
    if (musicLines.length > 0) {
      const calculatedPages = Math.max(
        1,
        Math.ceil(musicLines.length / linesPerPage),
      );
      setTotalPages(calculatedPages);

      // Dispatch page info event for the score component
      const event = new CustomEvent("score:pageInfo", {
        detail: {
          totalPages: calculatedPages,
          scoreId: scoreId,
        },
        bubbles: true,
      });
      document.dispatchEvent(event);
    }
  }, [musicLines, scoreId]);

  // Scroll to specific page
  const scrollToPage = useCallback(
    (pageIndex: number) => {
      const container = containerRef.current;
      if (!container || musicLines.length === 0) return;

      // Calculate position of the target music line
      const targetLineIndex = pageIndex * linesPerPage;
      if (targetLineIndex >= musicLines.length) return;

      const targetLine =
        musicLines[Math.min(targetLineIndex, musicLines.length - 1)];
      if (!targetLine) return;

      // Get the bounding rectangle of the target line
      const rect = targetLine.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Calculate scroll position with margin
      const scrollTop =
        container.scrollTop + (rect.top - containerRect.top) - pageMargin;

      // Smooth scroll to the position
      container.scrollTo({
        top: scrollTop,
        behavior: "smooth",
      });
    },
    [musicLines, linesPerPage],
  );

  // Handle page changes from parent component
  useEffect(() => {
    scrollToPage(currentPage);
  }, [currentPage, scrollToPage]);

  // Identify and catalog music lines for pagination
  const detectMusicLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // In OSMD, we have two options for pagination:
    // 1. Using staffline groups - this is more reliable for some scores
    const staffLines = container.querySelectorAll(".staffline");

    // 2. Using measure groups - works better for others
    const measureGroups = container.querySelectorAll(".vf-measure");

    // If we have stafflines, use those for pagination
    if (staffLines.length > 0) {
      // Group stafflines into pages of 4 lines each
      const groupedStaffLines: Element[][] = [];
      let currentGroup: Element[] = [];

      staffLines.forEach((line, index) => {
        currentGroup.push(line);

        // Every 4 lines (or at the end), start a new group
        if (
          (index + 1) % linesPerPage === 0 ||
          index === staffLines.length - 1
        ) {
          groupedStaffLines.push(currentGroup);
          currentGroup = [];
        }
      });

      // Flatten for easier access, but keep track of page boundaries
      setMusicLines(Array.from(staffLines));

      // If we have multiple lines, calculate typical line height
      if (staffLines.length > 1) {
        const firstLine = staffLines[0].getBoundingClientRect();
        const secondLine = staffLines[1].getBoundingClientRect();
        lineHeight.current = secondLine.top - firstLine.top;
      }

      if (debug) {
        console.log(
          `Detected ${staffLines.length} staff lines, grouped into ${groupedStaffLines.length} pages`,
        );
      }
    }
    // If no stafflines but we have measures, use those for pagination
    else if (measureGroups.length > 0) {
      // For measures, group them into fours for pagination
      const measuresPerPage = 4;
      const groupedMeasures: Element[][] = [];
      let currentGroup: Element[] = [];

      measureGroups.forEach((measure, index) => {
        currentGroup.push(measure);

        // Every 4 measures (or at the end), start a new group
        if (
          (index + 1) % measuresPerPage === 0 ||
          index === measureGroups.length - 1
        ) {
          groupedMeasures.push(currentGroup);
          currentGroup = [];
        }
      });

      // Use measures as our "lines" for pagination
      setMusicLines(Array.from(measureGroups));

      if (debug) {
        console.log(
          `Detected ${measureGroups.length} measures, grouped into ${groupedMeasures.length} pages`,
        );
      }
    } else {
      console.warn("Could not detect stafflines or measures for pagination");
    }
  }, [linesPerPage, debug]);

  const updateVisiblePages = useCallback(() => {
    const container = containerRef.current;
    if (!container || !osmdRef.current) return;
    const containerRect = container.getBoundingClientRect();
    const backends = osmdRef.current.Drawer.Backends;
    if (!backends || backends.length === 0) return;

    // Calculate current page based on scroll position
    if (musicLines.length > 0) {
      // Find the first visible music line
      let firstVisibleLineIndex = 0;
      let bestVisibility = -Infinity;

      for (let i = 0; i < musicLines.length; i++) {
        const lineRect = musicLines[i].getBoundingClientRect();

        // Calculate how much of the line is visible in the viewport
        const visibleTop = Math.max(lineRect.top, containerRect.top);
        const visibleBottom = Math.min(lineRect.bottom, containerRect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        // If this line is more visible than the previous best, update the index
        if (visibleHeight > bestVisibility) {
          bestVisibility = visibleHeight;
          firstVisibleLineIndex = i;
        }
      }

      // Calculate current page based on the visible line, using 4 lines per page
      const currentPageIndex = Math.floor(firstVisibleLineIndex / linesPerPage);

      // Only dispatch event if page has changed to avoid unnecessary rerendering
      if (currentPageIndex !== currentPage) {
        if (debug) {
          console.log(
            `Page changed to ${currentPageIndex} (line ${firstVisibleLineIndex})`,
          );
        }

        // Dispatch page change event
        const event = new CustomEvent("score:pageChange", {
          detail: {
            currentPage: currentPageIndex,
            scoreId: scoreId,
          },
          bubbles: true,
        });
        document.dispatchEvent(event);
      }
    }

    // Update visibility of SVG elements to improve performance
    for (const backend of backends) {
      const element = backend.getRenderElement();
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (
        rect.bottom < containerRect.top - 200 ||
        rect.top > containerRect.bottom + 200
      ) {
        element.style.display = "none";
      } else {
        element.style.display = "";
      }
    }
  }, [musicLines, linesPerPage, currentPage, scoreId, debug]);

  const clearDebugText = () => {
    document.querySelectorAll(".note-pitch-text").forEach((el) => el.remove());
  };

  function forEachNote(func: (note: GraphicalNote) => void) {
    if (!osmdRef.current) return;
    osmdRef.current.GraphicSheet.MeasureList.forEach((measureRow) =>
      measureRow.forEach((measure) =>
        measure.staffEntries.forEach((staffEntry) =>
          staffEntry.graphicalVoiceEntries.forEach((voiceEntry) =>
            voiceEntry.notes.forEach(func),
          ),
        ),
      ),
    );
  }

  const drawDebugText = () => {
    const svg = document.querySelector("#osmdSvgPage1");
    if (!svg) return;
    let i = 1;
    forEachNote((note) => {
      const bbox = note.PositionAndShape;
      const s =
        i++ +
        ": " +
        note.graphicalNoteLength.toString() +
        " " +
        // @ts-expect-error protected elements access
        (note.sourceNote.pitch
          ? // @ts-expect-error protected elements access
            note.sourceNote.pitch.ToStringShortGet
          : "null");
      const textEl = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      const pos = bbox.AbsolutePosition;
      textEl.setAttribute("x", (pos.x * 10 - 50).toString());
      textEl.setAttribute("y", (pos.y * 10).toString());
      textEl.setAttribute("fill", "purple");
      textEl.setAttribute("font-size", "11");
      textEl.setAttribute("class", "note-pitch-text");
      textEl.textContent = s;
      svg.appendChild(textEl);
    });
  };

  const {
    data: musicXMLUrl,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["musicXMLUrl", scoreId],
    queryFn: async () =>
      storage.getFileView(process.env.NEXT_PUBLIC_SCORES_BUCKET!, scoreId),
  });

  const fetchAndRender = useCallback(async () => {
    if (!containerRef.current || !musicXMLUrl) return;

    // Only perform the rendering if we haven't already rendered
    if (hasRenderedRef.current && osmdRef.current) {
      console.log("Sheet already rendered, skipping render");
      return;
    }

    try {
      if (!osmdRef.current) {
        const options: IOSMDOptions = {
          backend: "svg",
          drawTitle: true,
          autoResize: false, // Disable auto resize to prevent rerenders
          // Set appropriate rendering options for better display
          defaultFontFamily: "Arial",
          // Don't set pageFormat directly as an object - it expects a string format
        };
        osmdRef.current = new OpenSheetMusicDisplay(
          containerRef.current,
          options,
        );

        osmdRef.current.zoom = 1.0; // Set initial zoom level
        (osmdRef.current as any).backend.fetch = async (
          url: string,
          init?: RequestInit,
        ) => {
          const resp = await fetch(url, {
            ...init,
            credentials: "include", // send cookies/session
          });
          if (!resp.ok) {
            throw new Error(`Failed to fetch ${url}: ${resp.status}`);
          }
          return resp;
        };
      }

      log.debug("Loading music XML from URL:", musicXMLUrl);
      await osmdRef.current.load(musicXMLUrl);

      // Only render once and then set the flag
      osmdRef.current.render();
      hasRenderedRef.current = true;

      // After rendering, detect music lines for pagination
      setTimeout(() => {
        detectMusicLines();

        // Find the measures and adjust zoom to fit 4 per viewport if possible
        const adjustZoomForMeasures = () => {
          const container = containerRef.current;
          if (!container || !osmdRef.current) return;

          const containerWidth = container.clientWidth;

          // Look for measure elements - OSMD renders them with class 'vf-measure'
          const measures = container.querySelectorAll(".vf-measure");
          if (measures.length === 0) return;

          // Sample the width of the first few measures
          const measureSamples = Math.min(8, measures.length);
          let totalMeasureWidth = 0;

          for (let i = 0; i < measureSamples; i++) {
            const measureRect = measures[i].getBoundingClientRect();
            totalMeasureWidth += measureRect.width;
          }

          // Calculate average measure width
          const avgMeasureWidth = totalMeasureWidth / measureSamples;

          // Target 4 measures per viewport width with some margin
          const targetWidth = avgMeasureWidth * 4 * 1.1; // 10% margin

          // Calculate zoom factor to fit 4 measures
          // For wider scores we want to zoom out, for narrow scores zoom in
          const zoomFactor = containerWidth / targetWidth;

          // Apply zoom with limits to prevent extreme scaling
          const limitedZoom = Math.max(
            0.5,
            Math.min(2.0, zoomFactor * osmdRef.current.zoom),
          );

          // Instead of rerendering after zoom change, apply transform directly to SVG
          const svgContainer = container.querySelector("svg");
          if (svgContainer) {
            // Apply scale transform directly to SVG element
            svgContainer.style.transform = `scale(${limitedZoom})`;
            svgContainer.style.transformOrigin = "top left";

            // Update container to handle the new size without rerendering
            const newWidth =
              svgContainer.getBoundingClientRect().width * limitedZoom;
            const newHeight =
              svgContainer.getBoundingClientRect().height * limitedZoom;
            svgContainer.style.width = `${newWidth}px`;
            svgContainer.style.height = `${newHeight}px`;
          }

          // After adjusting zoom, detect lines again
          setTimeout(detectMusicLines, 100);
        };

        // Adjust zoom to fit 4 measures
        adjustZoomForMeasures();

        updateVisiblePages();

        // Set initial scroll position to current page
        if (currentPage > 0) {
          scrollToPage(currentPage);
        }
      }, 100);

      setRenderError(null); // Clear any previous rendering error on success
    } catch (error) {
      console.error("Error processing MusicXML file:", error);
      setRenderError((error as Error).message);
    }
  }, [
    musicXMLUrl,
    currentPage,
    detectMusicLines,
    scrollToPage,
    updateVisiblePages,
  ]);

  useEffect(() => {
    if (!containerRef.current || !musicXMLUrl) return;
    const start = performance.now();
    fetchAndRender().then(() => {
      console.log(`Rendering took ${performance.now() - start}ms`);
    });
  }, [fetchAndRender, musicXMLUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      updateVisiblePages();
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [musicLines, updateVisiblePages]);

  const handleRetry = () => {
    setRenderError(null);
    void refetch();
    retry();
  };

  // Debug panel buttons
  const handleRerender = () => {
    if (debug) {
      console.log("Manual rerender requested");
      // Only allow debug rerenders when debugging is enabled
      hasRenderedRef.current = false;
      void fetchAndRender();
    }
  };

  return (
    <div
      id={`score-${scoreId}`}
      className="overflow-hidden overflow-x-hidden flex flex-col place-items-center w-full h-full"
    >
      <div
        ref={containerRef}
        className={cn(
          "score-container border border-gray-300 dark:border-gray-700 rounded-md flex flex-col p-2 overflow-auto",
          "w-full h-full",
          !(isError || renderError) && "bg-gray-50",
        )}
      >
        {(isError || renderError) && (
          <div className="text-red-600 text-sm p-4">
            <h1 className="text-xl">An error occurred</h1>
            <p className="my-4">{renderError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={isFetching}
            >
              {isFetching ? "Retrying..." : "Retry"}
            </Button>
          </div>
        )}
      </div>
      {debug && (
        <div className="fixed top-[100px] right-[100px] bg-gray-700 flex gap-4 p-4 rounded-2xl">
          <Button onClick={handleRerender}>Force Rerender</Button>
          <Button onClick={drawDebugText}>Draw debug text</Button>
          <Button onClick={clearDebugText}>Clear debug text</Button>
        </div>
      )}
    </div>
  );
}
