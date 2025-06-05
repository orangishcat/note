import React, {
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  GraphicalNote,
  IOSMDOptions,
  OpenSheetMusicDisplay,
} from "opensheetmusicdisplay";
import ZoomableDiv from "@/components/ui-custom/zoomable-div";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import api from "@/lib/network";

export interface MusicScore {
  /** Appwrite document identifier */
  $id: string;
  name: string;
  subtitle: string;
  user_id?: string;
  file_id?: string;
  notes_id?: string;
  preview_id?: string;
  audio_file_id?: string;
  mime_type?: string;
  starred_users?: string[];
  /** Optional helper properties */
  $createdAt?: string;
  total_pages?: number;
  is_mxl?: boolean;
  starred?: boolean;
  folder?: string;
}

export interface MusicXMLRendererProps {
  scoreId: string;
  recenter: RefObject<HTMLButtonElement>;
  retry: () => void;
  isFullscreen?: boolean;
  pagesPerView: number; // New optional prop to control 1 or 2 pages per view
  currentPage: number;
}

export default function MusicXMLRenderer({
  scoreId,
  recenter,
  retry,
  isFullscreen,
  currentPage,
}: MusicXMLRendererProps) {
  const debug = !!localStorage.getItem("debug");
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [musicLines, setMusicLines] = useState<Element[]>([]);
  const linesPerPage = 4; // Number of music lines per page
  const lineHeight = useRef<number>(0);
  const pageMargin = 20; // Margin in pixels between pages
  const hasRenderedRef = useRef<boolean>(false); // Track if initial render is complete

  // New state for dynamic height calculation
  const [containerHeight, setContainerHeight] = useState<string>("100%");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Calculate container height dynamically based on available space
  useEffect(() => {
    const calculateHeight = () => {
      if (!wrapperRef.current) return;

      // Get the wrapper's position relative to the viewport
      const wrapperRect = wrapperRef.current.getBoundingClientRect();

      // Calculate the available space from the wrapper to the bottom of the viewport
      // Add a buffer (22px) to prevent overshooting the bottom of the screen
      const availableHeight = window.innerHeight - wrapperRect.top - 22;

      // Set minimum height to avoid too small containers
      const minHeight = 300;
      const newHeight = Math.max(availableHeight, minHeight);

      // Set the height
      setContainerHeight(`${newHeight}px`);

      // Debugging info when debug mode is on
      if (debug) {
        console.log(`Score container height: ${newHeight}px`, {
          windowHeight: window.innerHeight,
          wrapperTop: wrapperRect.top,
          availableHeight,
        });
      }
    };

    // Calculate on initial render and whenever fullscreen state changes
    calculateHeight();

    // Recalculate on window resize
    window.addEventListener("resize", calculateHeight);

    // Recalculate after a short delay to ensure all layouts are completed
    const timeout = setTimeout(calculateHeight, 100);

    return () => {
      window.removeEventListener("resize", calculateHeight);
      clearTimeout(timeout);
    };
  }, [isFullscreen, debug]);

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

  // Handle page changes from parent component
  useEffect(() => {
    scrollToPage(currentPage);
  }, [currentPage]);

  // Scroll to specific page
  const scrollToPage = (pageIndex: number) => {
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
  };

  // Identify and catalog music lines for pagination
  const detectMusicLines = () => {
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
  };

  const updateVisiblePages = () => {
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
  };

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
          ? note.sourceNote.pitch.ToStringShortGet
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
    data: musicXML,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["musicXMLBase64", scoreId],
    queryFn: async () => {
      const response = await api.get(`/score/as-base64/${scoreId}`, {
        responseType: "text",
      });
      return response.data;
    },
  });

  const fetchAndRender = useCallback(async () => {
    if (!containerRef.current || !musicXML) return;

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

        // After creating OSMD, configure additional settings that weren't accepted in constructor
        osmdRef.current.zoom = 1.0; // Set initial zoom level
        // We'll adjust the zoom level after rendering to fit better
      }

      await osmdRef.current.load(atob(musicXML), "Score");

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
  }, [musicXML, currentPage]);

  useEffect(() => {
    if (!containerRef.current || !musicXML) return;
    const start = performance.now();
    fetchAndRender().then(() => {
      console.log(`Rendering took ${performance.now() - start}ms`);
    });
  }, [fetchAndRender, musicXML]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      updateVisiblePages();
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [musicLines]);

  const handleRetry = () => {
    setRenderError(null);
    refetch();
    retry();
  };

  // Debug panel buttons
  const handleRerender = () => {
    if (debug) {
      console.log("Manual rerender requested");
      // Only allow debug rerenders when debugging is enabled
      hasRenderedRef.current = false;
      fetchAndRender();
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="overflow-hidden overflow-x-hidden flex flex-col place-items-center"
      style={{
        height: containerHeight,
        transition: "height 0.3s ease",
      }}
    >
      <ZoomableDiv recenter={recenter}>
        <div
          ref={containerRef}
          className={cn(
            "border flex flex-col p-2 overflow-auto",
            !(isError || renderError) && "bg-gray-50",
          )}
          style={{
            width: "min(calc(100vw - 12px), 70rem)",
            height: isFullscreen
              ? "calc(100vh - 20px)"
              : `calc(${containerHeight} - 16px)`,
          }}
        >
          {(isError || renderError) && (
            <div className="text-red-600 text-sm p-4">
              <h1 className="text-xl">An error occured</h1>
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
      </ZoomableDiv>
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
