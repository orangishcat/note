import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AxiosProgressEvent } from "axios";
import JSZip from "jszip";
import Image from "next/image";
import ZoomableDiv from "@/components/ui-custom/zoomable-div";
import { MusicXMLRendererProps } from "@/components/music-xml-renderer";
import { useQuery } from "@tanstack/react-query";
import log from "@/lib/logger";
import api from "@/lib/network";
import { ZoomContext } from "@/app/providers";
import { storage } from "@/lib/appwrite";

// Store blobs in memory cache
const blobCache = new Map<string, string[]>();

// Clear blob cache on page reload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    // Revoke all blob URLs before page unload
    blobCache.forEach((urls) => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    });
    blobCache.clear();
  });
}

export interface ImageScoreRendererProps extends MusicXMLRendererProps {
  displayMode?: "paged" | "scroll";
  verticalLoading?: boolean;
}

export default function ImageScoreRenderer({
  scoreId,
  recenter,
  currentPage,
  pagesPerView = 1,
  isFullscreen,
  displayMode = "paged",
  verticalLoading = false,
}: ImageScoreRendererProps) {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const targetPageRef = useRef(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState(1);
  const [defaultScale, setDefaultScale] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<
    "prev" | "next" | null
  >(null);
  const [transitionPage, setTransitionPage] = useState<number | null>(null);

  // New state for dynamic height calculation
  const [containerHeight, setContainerHeight] = useState<string>("100%");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Get zoom context
  const zoomContext = useContext(ZoomContext);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scoreContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const mouseStartX = useRef(0);
  const mouseCurrentX = useRef(0);
  const isDragging = useRef(false);
  const fetchedRef = useRef<boolean>(false);
  const isProcessingScroll = useRef<boolean>(false);

  // Debug mode flag
  const debug = !!localStorage.getItem("debug");

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
        log.debug(`Image score container height: ${newHeight}px`, {
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

  // Adjust scaling for small screens
  useEffect(() => {
    const adjustForSmallScreens = () => {
      if (scoreContainerRef.current && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;

        // For very small screens (<500px), adjust the scaling
        if (containerWidth < 500) {
          const smallScreenScale = (containerWidth / 800) * 0.95; // 5% margin

          // Only update if significantly different to avoid constant updates
          if (Math.abs(smallScreenScale - defaultScale) > 0.05) {
            setDefaultScale(smallScreenScale);
            if (zoomContext) {
              zoomContext.setZoomLevel(scoreId, smallScreenScale);
            }
          }
        }
      }
    };

    adjustForSmallScreens();
    window.addEventListener("resize", adjustForSmallScreens);

    return () => {
      window.removeEventListener("resize", adjustForSmallScreens);
    };
  }, [scoreId, zoomContext, defaultScale]);

  // Fetch score file using React Query
  const {
    data,
    isLoading,
    isError,
    refetch: refetchScoreFile,
  } = useQuery({
    queryKey: ["scoreFile", scoreId],
    queryFn: async () => {
      // Use cache if available
      if (blobCache.has(scoreId)) {
        log.debug(`Using cached score data for ${scoreId}`);
        return {
          urls: blobCache.get(scoreId) || [],
          fromCache: true,
        };
      }

      // Prevent duplicate fetches during React's double-render
      if (fetchedRef.current) {
        // Wait for the first render's fetch to complete
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (blobCache.has(scoreId)) {
          log.debug(`Using cached score data after waiting for ${scoreId}`);
          return {
            urls: blobCache.get(scoreId) || [],
            fromCache: true,
          };
        }
      }

      fetchedRef.current = true;
      setLoadingProgress(0);

      // Fetch from API
      log.info(`Fetching score file ${scoreId}`);

      try {
        const url = storage.getFileDownload(
          process.env.NEXT_PUBLIC_SCORES_BUCKET!,
          scoreId,
        );
        log.debug(`Fetching url ${url}`);
        const response = await api.get(url, {
          responseType: "blob",
          onDownloadProgress: (progressEvent: AxiosProgressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total,
              );
              setLoadingProgress(percentCompleted);
            }
          },
        });

        const fileBlob = response.data as Blob;
        const urls: string[] = [];

        setLoadingProgress(90);

        if (fileBlob.type === "application/zip") {
          log.debug(`Processing zip file for ${scoreId}`);
          const zip = await JSZip.loadAsync(fileBlob);
          const imageFiles = Object.keys(zip.files).filter(
            (filename) =>
              !zip.files[filename].dir && /\.(png|jpe?g|gif)$/i.test(filename),
          );

          let processedEntries = 0;

          for (const filename of imageFiles) {
            const zipEntry = zip.files[filename];
            const entryBlob = await zipEntry.async("blob");
            const url = URL.createObjectURL(entryBlob);
            urls.push(url);

            processedEntries++;
            const extractionProgress =
              90 + Math.round((processedEntries / imageFiles.length) * 10);
            setLoadingProgress(Math.min(extractionProgress, 100));
          }

          log.info(`Extracted ${urls.length} images from zip for ${scoreId}`);
        } else if (fileBlob.type.startsWith("image/")) {
          log.debug(`Processing single image for ${scoreId}`);
          const url = URL.createObjectURL(fileBlob);
          urls.push(url);
          setLoadingProgress(100);
        } else {
          throw new Error(`Unsupported file type: ${fileBlob.type}`);
        }

        // Cache the blobs
        blobCache.set(scoreId, urls);

        return { urls, fromCache: false };
      } catch (error) {
        log.error(`Error fetching score file ${scoreId}:`, error);
        throw error;
      }
    },
    staleTime: 7 * 24 * 60 * 60 * 1000, // 1 week
    gcTime: 7 * 24 * 60 * 60 * 1000, // 1 week
    retry: 1, // Only retry once to avoid excessive requests
  });

  // Function to safely refetch score file with debounce
  const debouncedRefetch = useRef<NodeJS.Timeout | null>(null);
  const safeRefetchScoreFile = () => {
    // Clear any existing timeout
    if (debouncedRefetch.current) {
      clearTimeout(debouncedRefetch.current);
    }

    // Set a new timeout to prevent multiple rapid refetches
    debouncedRefetch.current = setTimeout(() => {
      log.debug(`Safely refetching score file for ${scoreId}`);
      void refetchScoreFile();
      debouncedRefetch.current = null;
    }, 1000); // 1 second debounce
  };

  // Handle query results
  useEffect(() => {
    if (data?.urls) {
      setImageUrls(data.urls);
      setError(null);

      // Report total pages on successful load
      if (data.urls.length > 0) {
        const event = new CustomEvent("score:pageInfo", {
          detail: {
            scoreId,
            totalPages: data.urls.length,
            currentPage: currentPageIndex,
          },
          bubbles: true,
        });
        document.dispatchEvent(event);
      }
    }
  }, [data, scoreId, currentPageIndex]);

  // Handle query errors
  useEffect(() => {
    if (isError) {
      setError("Failed to load score. Please try again.");
    }
  }, [isError]);

  // Initialize scale from context or calculate initial scale to fit height
  useEffect(() => {
    const calculateScale = () => {
      if (scoreContainerRef.current && containerRef.current) {
        const containerHeight = containerRef.current.clientHeight;
        const containerWidth = containerRef.current.clientWidth;

        const contentHeight = 1000; // Standard height of our score container
        const contentWidth = pagesPerView === 2 ? 1600 : 800;

        const scaleToFitHeight = containerHeight / contentHeight;
        const scaleToFitWidth = containerWidth / contentWidth;

        const scaleToFit = Math.min(scaleToFitHeight, scaleToFitWidth) * 0.95; // 5% margin

        setDefaultScale(scaleToFit);

        // Check if we have a stored scale in context first
        if (zoomContext) {
          const storedScale = zoomContext.getZoomLevel(scoreId);
          if (storedScale !== 1) {
            // If not default value
            setCurrentScale(storedScale);
            return;
          }
        }

        // Otherwise use calculated scale
        setCurrentScale(scaleToFit);
      }
    };

    calculateScale();
    window.addEventListener("resize", calculateScale);

    return () => {
      window.removeEventListener("resize", calculateScale);
    };
  }, [isFullscreen, pagesPerView, scoreId, zoomContext]);

  // Calculate the total number of views based on page count and pagesPerView
  const totalViews = Math.ceil(imageUrls.length / pagesPerView);

  const notifyPageChange = useCallback(
    (pageIndex: number) => {
      if (typeof window !== "undefined") {
        log.debug(`Notifying page change to ${pageIndex}`);
        const event = new CustomEvent("score:pageChange", {
          detail: {
            scoreId,
            currentPage: pageIndex,
          },
          bubbles: true,
        });
        document.dispatchEvent(event);

        // Force redraw of any page-specific annotations
        setTimeout(() => {
          log.debug(`Requesting redraw for page ${pageIndex}`);
          const redrawEvent = new CustomEvent("score:redrawAnnotations", {
            detail: {
              scoreId,
              currentPage: pageIndex,
            },
            bubbles: true,
          });
          document.dispatchEvent(redrawEvent);
        }, 500); // Increased delay to ensure page render is complete
      }
    },
    [scoreId],
  );

  // Navigation function for page turning
  const startAnimation = useCallback(
    (newIndex: number, dir: "prev" | "next") => {
      setAnimationDirection(dir);
      setIsAnimating(true);
      setTransitionPage(newIndex);
      setTimeout(() => {
        setCurrentPageIndex(newIndex);
        setIsAnimating(false);
        setAnimationDirection(null);
        setTransitionPage(null);
        notifyPageChange(newIndex);
        if (targetPageRef.current !== newIndex) {
          const nextDir = targetPageRef.current > newIndex ? "next" : "prev";
          startAnimation(targetPageRef.current, nextDir);
        }
      }, 300);
    },
    [notifyPageChange],
  );

  useEffect(() => {
    targetPageRef.current = currentPageIndex;
  }, [currentPageIndex]);

  const navigatePages = useCallback(
    (direction: "prev" | "next") => {
      let newTarget = targetPageRef.current;
      if (direction === "prev" && newTarget > 0) {
        newTarget -= 1;
      } else if (direction === "next" && newTarget < totalViews - 1) {
        newTarget += 1;
      }
      targetPageRef.current = newTarget;
      if (!isAnimating) {
        startAnimation(newTarget, direction);
      }
    },
    [isAnimating, totalViews, startAnimation],
  );

  // Sync with external currentPage prop if provided
  useEffect(() => {
    if (currentPage !== undefined) {
      const maxPage = Math.max(0, totalViews - 1);
      const safeCurrentPage = Math.min(currentPage, maxPage);

      if (safeCurrentPage !== currentPageIndex) {
        setCurrentPageIndex(safeCurrentPage);
        targetPageRef.current = safeCurrentPage;

        // Don't animate distant page jumps
        if (Math.abs(safeCurrentPage - currentPageIndex) > 1) {
          setIsAnimating(false);
          setAnimationDirection(null);
          setTransitionPage(null);
        }

        // Notify about the page change to update annotations
        notifyPageChange(safeCurrentPage);
      }
    }
  }, [currentPage, totalViews, currentPageIndex, notifyPageChange]);

  // Event handlers for navigation

  // Keyboard handler for arrow key navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isAnimating) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // Prevent default behavior (like scrolling)
        e.preventDefault();

        // Navigate to previous or next page
        navigatePages(e.key === "ArrowLeft" ? "prev" : "next");
      }
    },
    [isAnimating, navigatePages],
  );

  // Wheel handler - horizontal scrolling for page navigation
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (isAnimating) return;

      // Handle horizontal scrolling for navigation
      if (Math.abs(e.deltaX) > 20 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();

        // Handle macOS momentum scroll by only allowing one navigation per gesture
        if (!isProcessingScroll.current) {
          isProcessingScroll.current = true;

          // Determine direction and navigate
          navigatePages(e.deltaX > 0 ? "next" : "prev");

          // Debounce to prevent multiple triggers during momentum scrolling
          // The 500ms timeout helps ensure we catch the entire momentum scroll sequence
          setTimeout(() => {
            isProcessingScroll.current = false;
          }, 500);
        }
      }
    },
    [isAnimating, navigatePages],
  );

  // Touch handlers for swipe navigation
  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;

    // Prevent browser back navigation on horizontal swipe
    if (Math.abs(touchEndX.current - touchStartX.current) > 10) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (isAnimating) return;

      const swipeThreshold = 50;
      const diff = touchEndX.current - touchStartX.current;

      if (Math.abs(diff) > swipeThreshold) {
        navigatePages(diff > 0 ? "prev" : "next");
        e.preventDefault();
      }
    },
    [isAnimating, navigatePages],
  );

  // Mouse drag handlers for page navigation
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    mouseCurrentX.current = e.clientX;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;

    const dragThreshold = 50;
    const diff = mouseCurrentX.current - mouseStartX.current;

    if (Math.abs(diff) > dragThreshold) {
      navigatePages(diff > 0 ? "prev" : "next");
    }

    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    isDragging.current = false;
  }, [navigatePages, handleMouseMove]);

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (isAnimating) return;

      isDragging.current = true;
      mouseStartX.current = e.clientX;

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [isAnimating, handleMouseMove, handleMouseUp],
  );

  // Scale change handler from ZoomableDiv
  const handleScaleChange = (scale: number) => {
    // Only update if the scale has changed
    if (scale !== currentScale) {
      setCurrentScale(scale);

      // Store the scale in the zoom context
      if (zoomContext) {
        zoomContext.setZoomLevel(scoreId, scale);
      }
    }
  };

  // Image load handler
  const handleImageLoad = (pageIndex: number) => {
    // Notify when an image has loaded to trigger annotation redraw
    setTimeout(() => {
      log.debug(`Image loaded for page index ${pageIndex}, triggering redraw`);
      const event = new CustomEvent("score:redrawAnnotations", {
        detail: {
          scoreId,
          currentPage: pageIndex,
        },
        bubbles: true,
      });
      document.dispatchEvent(event);
    }, 200); // Increased delay to ensure DOM is fully ready
  };

  // Set up event listeners
  useEffect(() => {
    // Block browser's default back/forward navigation on swipe
    const preventDefaultNavigation = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touchX = e.touches[0].clientX;
        if (touchX < 50 || touchX > window.innerWidth - 50) {
          e.preventDefault();
        }
      }
    };

    // Add keyboard event listener for arrow key navigation
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("touchstart", preventDefaultNavigation, {
      passive: false,
    });

    const container = containerRef.current;
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false });
      container.addEventListener("touchstart", handleTouchStart, {
        passive: false,
      });
      container.addEventListener("touchmove", handleTouchMove, {
        passive: false,
      });
      container.addEventListener("touchend", handleTouchEnd as EventListener, {
        passive: false,
      });
      container.addEventListener("mousedown", handleMouseDown as EventListener);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("touchstart", preventDefaultNavigation);

      if (container) {
        container.removeEventListener("wheel", handleWheel);
        container.removeEventListener("touchstart", handleTouchStart);
        container.removeEventListener("touchmove", handleTouchMove);
        container.removeEventListener(
          "touchend",
          handleTouchEnd as EventListener,
        );
        container.removeEventListener(
          "mousedown",
          handleMouseDown as EventListener,
        );
      }

      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    currentPageIndex,
    totalViews,
    currentScale,
    isAnimating,
    scoreId,
    handleKeyDown,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleTouchEnd,
    handleWheel,
  ]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-4 h-full">
        <h1 className="text-xl my-4">Loading score...</h1>
        <div className="w-64 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 my-4">
          <div
            className="bg-primary h-2.5 rounded-full transition-all duration-300"
            style={{ width: `20%` }}
          ></div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Error loading score. Please try again.
        </p>
        <button
          onClick={() => safeRefetchScoreFile()}
          className="mt-4 px-4 py-2 bg-primary-100 hover:bg-primary-200 text-primary-800 rounded text-sm"
        >
          Reload
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-4 h-full">
        <h1 className="text-xl my-4">Loading score...</h1>
        {verticalLoading ? (
          <div className="h-64 bg-gray-200 rounded-full w-2.5 dark:bg-gray-700 my-4">
            <div
              className="bg-primary w-2.5 rounded-full transition-all duration-300"
              style={{ height: `${loadingProgress}%` }}
            ></div>
          </div>
        ) : (
          <div className="w-64 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 my-4">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
        )}
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {loadingProgress < 90
            ? `Downloading score data... ${loadingProgress}%`
            : `Processing images... ${loadingProgress}%`}
        </p>
      </div>
    );
  }

  if (displayMode === "scroll") {
    return (
      <div
        ref={(el) => {
          wrapperRef.current = el;
          containerRef.current = el;
        }}
        id={`score-${scoreId}`}
        className="overflow-y-auto flex flex-col items-center relative"
        style={{ height: containerHeight, transition: "height 0.3s ease" }}
      >
        <ZoomableDiv
          recenter={recenter}
          onScaleChange={handleScaleChange}
          defaultScale={defaultScale}
        >
          <div
            ref={scoreContainerRef}
            className="score-container relative bg-white flex flex-col items-center"
            style={{ width: "800px" }}
          >
            {imageUrls.map((url, index) => (
              <div
                key={`scroll-${index}`}
                className="page-container relative"
                style={{ width: "800px", height: "1000px" }}
              >
                <Image
                  src={url}
                  draggable={false}
                  layout="fill"
                  objectFit="contain"
                  alt={`Score page ${index + 1}`}
                  style={{ display: "block" }}
                  onError={() => safeRefetchScoreFile()}
                  onLoad={() => handleImageLoad(index)}
                />
              </div>
            ))}
          </div>
        </ZoomableDiv>
      </div>
    );
  }

  // Calculate which pages to display based on currentPageIndex and pagesPerView
  const startIndex = currentPageIndex * pagesPerView;
  const visiblePages = imageUrls.slice(startIndex, startIndex + pagesPerView);

  // If we're animating, also prepare the transition pages
  let transitionStartIndex = null;
  let transitionPages = null;
  if (isAnimating && transitionPage !== null) {
    transitionStartIndex = transitionPage * pagesPerView;
    transitionPages = imageUrls.slice(
      transitionStartIndex,
      transitionStartIndex + pagesPerView,
    );
  }

  // Calculate animation classes
  const currentPageAnimClass = isAnimating
    ? animationDirection === "next"
      ? "animate-slide-out-left"
      : "animate-slide-out-right"
    : "";

  const transitionPageAnimClass = isAnimating
    ? animationDirection === "next"
      ? "animate-slide-in-right"
      : "animate-slide-in-left"
    : "";

  return (
    <div
      ref={(el) => {
        wrapperRef.current = el;
        containerRef.current = el;
      }}
      id={`score-${scoreId}`}
      className="overflow-x-hidden flex flex-col place-items-center relative"
      style={{
        height: containerHeight,
        transition: "height 0.3s ease",
      }}
      tabIndex={0} // Make div focusable for keyboard events
    >
      <ZoomableDiv
        recenter={recenter}
        onScaleChange={handleScaleChange}
        defaultScale={defaultScale}
      >
        <div
          ref={scoreContainerRef}
          className="score-container relative bg-white"
          style={{
            width: pagesPerView === 2 ? "1600px" : "800px",
            height: "1000px",
          }}
        >
          {/* Current page */}
          <div
            className={currentPageAnimClass}
            style={{
              display: "flex",
              flexDirection: "row",
              width: "100%",
              height: "100%",
            }}
          >
            {visiblePages.map((url, index) => (
              <div
                key={`current-${currentPageIndex}-${index}`}
                className="bg-white page-container"
                style={{
                  flex: "0 0 auto",
                  width: pagesPerView === 2 ? "800px" : "800px",
                  height: "1000px",
                  position: "relative",
                }}
              >
                <Image
                  src={url}
                  draggable={false}
                  layout="fill"
                  objectFit="contain"
                  alt={`Score page ${startIndex + index + 1}`}
                  style={{ display: "block" }}
                  onError={() => safeRefetchScoreFile()}
                  onLoad={() => handleImageLoad(startIndex + index)}
                />
              </div>
            ))}
          </div>

          {/* Transition page - only rendered during animations */}
          {isAnimating && transitionPages && (
            <div
              className={transitionPageAnimClass}
              style={{
                display: "flex",
                flexDirection: "row",
                width: "100%",
                height: "100%",
              }}
            >
              {transitionPages.map((url, index) => (
                <div
                  key={`transition-${transitionPage}-${index}`}
                  className="bg-white"
                  style={{
                    flex: "0 0 auto",
                    width: pagesPerView === 2 ? "800px" : "800px",
                    height: "1000px",
                    padding: "0.5rem",
                    position: "relative",
                  }}
                >
                  <Image
                    src={url}
                    draggable={false}
                    layout="fill"
                    objectFit="contain"
                    alt={`Score page ${
                      transitionStartIndex !== null
                        ? transitionStartIndex + index + 1
                        : ""
                    }`}
                    style={{ display: "block" }}
                    onError={() => safeRefetchScoreFile()}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </ZoomableDiv>
    </div>
  );
}
