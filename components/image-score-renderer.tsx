import React, {useEffect, useRef, useState} from 'react';
import axios from 'axios';
import JSZip from 'jszip';
import Image from 'next/image';
import ZoomableDiv from '@/components/ui-custom/zoomable-div';
import {MusicXMLRendererProps} from '@/components/music-xml-renderer';
import {useQuery, useQueryClient} from '@tanstack/react-query';

// Time constants for caching
const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

// Store blobs in memory cache
const blobCache = new Map<string, string[]>();

interface ScoreFileResponse {
    urls: string[];
    fromCache: boolean;
}

export default function ImageScoreRenderer({
                                               scoreId,
                                               recenter,
                                               retry,
                                               pagesPerView = 1, // New optional prop to control 1 or 2 pages per view
                                               isFullscreen = false,
                                           }: MusicXMLRendererProps & { pagesPerView?: number, isFullscreen?: boolean }) {
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [isZoomed, setIsZoomed] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationDirection, setAnimationDirection] = useState<'prev' | 'next' | null>(null);
    const [transitionPage, setTransitionPage] = useState<number | null>(null);
    const [defaultScale, setDefaultScale] = useState(1);
    const [currentScale, setCurrentScale] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);
    const scoreContainerRef = useRef<HTMLDivElement>(null);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);
    const mouseStartX = useRef(0);
    const mouseCurrentX = useRef(0);
    const isDragging = useRef(false);

    // Get the queryClient for manual invalidation
    const queryClient = useQueryClient();

    // Fetch score file using React Query
    const fetchScoreFileData = async (): Promise<ScoreFileResponse> => {
        // Check if we already have cached blobs for this score
        if (blobCache.has(scoreId)) {
            const cachedUrls = blobCache.get(scoreId)!;
            
            // Verify that all blob URLs in the cache are still valid
            try {
                // Basic validation - check if URLs exist and are accessible
                const areUrlsValid = await Promise.all(
                    cachedUrls.map(async (url) => {
                        try {
                            // Attempt to fetch the blob URL as a head request
                            const response = await fetch(url, { method: 'HEAD' });
                            return response.ok;
                        } catch (e) {
                            console.error('Error validating blob URL:', e);
                            return false;
                        }
                    })
                );
                
                // If all URLs are valid, return them
                if (areUrlsValid.every(Boolean)) {
                    console.log('Using cached blobs for score', scoreId);
                    return { urls: cachedUrls, fromCache: true };
                } else {
                    console.log('Some cached blobs are invalid, refetching score', scoreId);
                    // Continue to fetch new blobs below
                }
            } catch (error) {
                console.error('Error validating cached blobs:', error);
                // Continue to fetch new blobs below
            }
            
            // If we reach here, some validation failed - remove invalid cache entry
            blobCache.delete(scoreId);
        }
        
        // Fetch from API (happens if no cache or cache validation failed)
        const response = await axios.get(`/api/score/download/${scoreId}`, {
            responseType: 'blob',
        });
        const fileBlob = response.data as Blob;
        const urls: string[] = [];
        
        if (fileBlob.type === 'application/zip') {
            const zip = await JSZip.loadAsync(fileBlob);
            for (const filename in zip.files) {
                const zipEntry = zip.files[filename];
                if (!zipEntry.dir && /\.(png|jpe?g|gif)$/i.test(filename)) {
                    const entryBlob = await zipEntry.async('blob');
                    const url = URL.createObjectURL(entryBlob);
                    urls.push(url);
                }
            }
        } else if (fileBlob.type.startsWith('image/')) {
            const url = URL.createObjectURL(fileBlob);
            urls.push(url);
        } else {
            throw new Error(`Unsupported file type: ${fileBlob.type}`);
        }
        
        // Cache the blobs
        blobCache.set(scoreId, urls);
        
        return { urls, fromCache: false };
    };
    
    // React Query for score file
    const { data, isLoading, isError, error: queryError, refetch: refetchScoreFile } = useQuery<ScoreFileResponse, Error>({
        queryKey: ['scoreFile', scoreId],
        queryFn: fetchScoreFileData,
        staleTime: ONE_WEEK_IN_MS, // Data is fresh for a week
        gcTime: ONE_WEEK_IN_MS, // Keep in cache for a week
        retry: 2,
    });

    // Handle query results
    useEffect(() => {
        if (data) {
            setImageUrls(data.urls);
            setError(null);
        }
    }, [data]);

    // Check for empty URLs array and refetch if needed
    useEffect(() => {
        if (data && data.urls.length === 0) {
            console.warn('Retrieved empty URLs array for score:', scoreId);
            // Remove from cache and retry
            blobCache.delete(scoreId);
            // Add a small delay before retrying
            setError('Score data appears to be empty. Retrying...');
            setTimeout(() => {
                // Refetch both the score data and score file
                retry(); // Refetch score data from parent
                refetchScoreFile(); // Refetch the score file/blob
                queryClient.invalidateQueries({ queryKey: ['scoreFile', scoreId] });
            }, 800);
        }
    }, [data, scoreId, retry, refetchScoreFile, queryClient]);

    // Handle query errors
    useEffect(() => {
        if (isError && queryError) {
            console.error('Error fetching score file:', queryError);
            setError('Failed to load score. Please try again.');
        }
    }, [isError, queryError]);

    // Calculate initial scale to fit height when component mounts or container resizes
    useEffect(() => {
        const calculateScale = () => {
            if (scoreContainerRef.current) {
                const viewportHeight = window.innerHeight - (isFullscreen ? 0 : 176); // 11rem = 176px
                const contentHeight = 1000; // Height of our score container
                const scaleToFit = viewportHeight / contentHeight;
                setDefaultScale(Math.min(scaleToFit, 1)); // Don't scale up beyond original size
            }
        };

        calculateScale();
        window.addEventListener('resize', calculateScale);
        
        return () => {
            window.removeEventListener('resize', calculateScale);
        };
    }, [isFullscreen]);

    // Calculate the total number of views based on page count and pagesPerView setting
    const totalViews = Math.ceil(imageUrls.length / pagesPerView);

    // Function to check if zoom level is near default for swiping
    const isNearDefaultZoom = (scale: number) => {
        return scale >= 0.95 * defaultScale && scale <= 1.05 * defaultScale;
    };

    // Handle navigation to previous or next page with animation
    const navigatePages = (direction: 'prev' | 'next') => {
        // Check if zoom is near default to allow swiping even if technically "zoomed"
        const zoomTooHigh = !isNearDefaultZoom(currentScale);
        
        if (zoomTooHigh || isAnimating) return; // Prevent navigation when zoomed in (beyond threshold) or already animating
        
        setAnimationDirection(direction);
        setIsAnimating(true);
        
        // Calculate the new page index
        let newPageIndex;
        if (direction === 'prev' && currentPageIndex > 0) {
            newPageIndex = currentPageIndex - 1;
        } else if (direction === 'next' && currentPageIndex < totalViews - 1) {
            newPageIndex = currentPageIndex + 1;
        } else {
            // If we can't navigate in the requested direction, abort
            setIsAnimating(false);
            setAnimationDirection(null);
            return;
        }
        
        // Set the transition page (the page we're transitioning to)
        setTransitionPage(newPageIndex);
        
        // After animation completes, update the current page and reset animation state
        setTimeout(() => {
            setCurrentPageIndex(newPageIndex);
            setIsAnimating(false);
            setAnimationDirection(null);
            setTransitionPage(null);
        }, 300); // Match this with CSS transition duration
    };

    // Handle wheel events for page navigation - only respond to horizontal scrolling
    const handleWheel = (e: WheelEvent) => {
        // Only handle horizontal scrolling when zoom is acceptable
        if (!isNearDefaultZoom(currentScale) || isAnimating) return;
        
        // Prevent default to avoid page scrolling
        if (Math.abs(e.deltaX) > 20 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            navigatePages(e.deltaX > 0 ? 'next' : 'prev');
        }
    };

    // Handle touch events for swipe navigation
    const handleTouchStart = (e: TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        
        // Prevent browser back navigation on horizontal swipe
        if (e.touches.length === 1) {
            e.preventDefault();
        }
    };

    const handleTouchMove = (e: TouchEvent) => {
        touchEndX.current = e.touches[0].clientX;
        
        // Prevent browser back navigation on horizontal swipe
        if (Math.abs(touchEndX.current - touchStartX.current) > 10) {
            e.preventDefault();
        }
    };

    const handleTouchEnd = (e: TouchEvent) => {
        if (!isNearDefaultZoom(currentScale) || isAnimating) return; // Prevent swipe when zoomed in or animating
        
        const swipeThreshold = 50; // Minimum distance for a swipe
        const diff = touchEndX.current - touchStartX.current;
        
        if (Math.abs(diff) > swipeThreshold) {
            navigatePages(diff > 0 ? 'prev' : 'next');
            e.preventDefault(); // Prevent any default browser behavior
        }
    };

    // Handle mouse drag events for page navigation
    const handleMouseDown = (e: MouseEvent) => {
        if (!isNearDefaultZoom(currentScale) || isAnimating) return;
        
        isDragging.current = true;
        mouseStartX.current = e.clientX;
        
        // Add the temporary event listeners for drag tracking
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        mouseCurrentX.current = e.clientX;
    };

    const handleMouseUp = () => {
        if (!isDragging.current) return;
        
        const dragThreshold = 50; // Minimum distance for a drag
        const diff = mouseCurrentX.current - mouseStartX.current;
        
        if (Math.abs(diff) > dragThreshold) {
            navigatePages(diff > 0 ? 'prev' : 'next');
        }
        
        // Clean up event listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        isDragging.current = false;
    };

    // Watch for scale changes from ZoomableDiv
    const handleScaleChange = (scale: number) => {
        setCurrentScale(scale);
        // Set zoomed flag for UI elements visibility
        setIsZoomed(!isNearDefaultZoom(scale));
    };

    useEffect(() => {
        // Block browser's default back/forward navigation on swipe
        const preventDefaultNavigation = (e: TouchEvent) => {
            // Only prevent if it might be a horizontal swipe
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                const touchX = touch.clientX;
                
                // Check if touch is near screen edge (common for back navigation)
                if (touchX < 50 || touchX > window.innerWidth - 50) {
                    e.preventDefault();
                }
            }
        };
        
        document.addEventListener('touchstart', preventDefaultNavigation, { passive: false });
        
        // Set up event listeners for navigation
        const container = containerRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
            container.addEventListener('touchstart', handleTouchStart, { passive: false });
            container.addEventListener('touchmove', handleTouchMove, { passive: false });
            container.addEventListener('touchend', handleTouchEnd as EventListener, { passive: false });
            container.addEventListener('mousedown', handleMouseDown as EventListener);
        }
        
        return () => {
            document.removeEventListener('touchstart', preventDefaultNavigation);
            
            if (container) {
                container.removeEventListener('wheel', handleWheel);
                container.removeEventListener('touchstart', handleTouchStart);
                container.removeEventListener('touchmove', handleTouchMove);
                container.removeEventListener('touchend', handleTouchEnd as EventListener);
                container.removeEventListener('mousedown', handleMouseDown as EventListener);
            }
            // Clean up any lingering document event listeners
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [currentPageIndex, totalViews, currentScale, isAnimating]);

    // Manual retry handler
    const handleRetry = () => {
        // Clear blob cache for this score
        blobCache.delete(scoreId);
        
        // Invalidate both queries
        retry(); // Parent component's score data query
        refetchScoreFile(); // Score file query
        queryClient.invalidateQueries({ queryKey: ['scoreFile', scoreId] });
    };

    // Handle image error - if an image fails to load, invalidate the cache and retry
    const handleImageError = (url: string) => {
        console.error('Image failed to load:', url);
        
        // Clear the cache for this score
        blobCache.delete(scoreId);
        
        // Trigger a refetch using the retry callback
        setError('An image failed to load. Retrying...');
        setTimeout(() => {
            retry(); // Parent score data
            refetchScoreFile(); // Score file/blob 
            queryClient.invalidateQueries({ queryKey: ['scoreFile', scoreId] });
        }, 500);
    };

    if (error) {
        return (
          <div
            className="flex flex-col items-center justify-center text-center p-4 text-red-600"
            style={{height: 'calc(100vh - 11rem)'}}
          >
              <h1 className="text-xl my-4">{error}</h1>
              <button
                onClick={handleRetry}
                className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded"
              >
                  Retry
              </button>
          </div>
        );
    }

    if (isLoading) {
        return (
          <div
            className="flex flex-col items-center justify-center text-center p-4"
            style={{height: 'calc(100vh - 11rem)'}}
          >
              <h1 className="text-xl my-4">Loading score...</h1>
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
        transitionPages = imageUrls.slice(transitionStartIndex, transitionStartIndex + pagesPerView);
    }

    // Add navigation indicators/controls
    const showNavigation = totalViews > 1;

    // Calculate animation classes
    const currentPageAnimClass = isAnimating 
        ? animationDirection === 'next' 
            ? 'animate-slide-out-left' 
            : 'animate-slide-out-right'
        : '';
        
    const transitionPageAnimClass = isAnimating 
        ? animationDirection === 'next' 
            ? 'animate-slide-in-right' 
            : 'animate-slide-in-left'
        : '';

    return (
      <div
        ref={containerRef}
        className="overflow-x-hidden flex flex-col place-items-center relative"
        style={{
            height: isFullscreen ? '100vh' : 'calc(100vh - 11rem)',
            transition: 'height 0.3s ease'
        }}
      >
          <ZoomableDiv 
              recenter={recenter}
              onScaleChange={handleScaleChange}
              defaultScale={defaultScale}
          >
              {/* Container for the page transition effect */}
              <div 
                  ref={scoreContainerRef}
                  style={{
                      width: pagesPerView === 2 ? "1600px" : "800px", 
                      height: "1000px",
                      position: "relative",
                      backgroundColor: "#fff",
                  }}
              >
                  {/* Current page */}
                  <div 
                      className={currentPageAnimClass}
                      style={{
                          display: 'flex', 
                          flexDirection: 'row',
                          width: "100%",
                          height: "100%",
                      }}
                  >
                      {visiblePages.map((url, index) => (
                        <div
                          key={`current-${currentPageIndex}-${index}`}
                          className="bg-white"
                          style={{
                              flex: '0 0 auto',
                              width: pagesPerView === 2 ? '800px' : '800px',
                              height: '1000px',
                              padding: '0.5rem',
                              position: "relative"
                          }}
                        >
                            <Image
                              src={url}
                              draggable={false}
                              layout="fill"
                              objectFit="contain"
                              alt={`Score page ${startIndex + index + 1}`}
                              style={{display: 'block'}}
                              onError={() => handleImageError(url)}
                            />
                        </div>
                      ))}
                  </div>
                  
                  {/* Transition page - only rendered during animations */}
                  {isAnimating && transitionPages && (
                      <div 
                          className={transitionPageAnimClass}
                          style={{
                              display: 'flex', 
                              flexDirection: 'row',
                              width: "100%",
                              height: "100%",
                          }}
                      >
                          {transitionPages.map((url, index) => (
                            <div
                              key={`transition-${transitionPage}-${index}`}
                              className="bg-white"
                              style={{
                                  flex: '0 0 auto',
                                  width: pagesPerView === 2 ? '800px' : '800px',
                                  height: '1000px',
                                  padding: '0.5rem',
                                  position: "relative"
                              }}
                            >
                                <Image
                                  src={url}
                                  draggable={false}
                                  layout="fill"
                                  objectFit="contain"
                                  alt={`Score page ${transitionStartIndex !== null ? transitionStartIndex + index + 1 : ''}`}
                                  style={{display: 'block'}}
                                  onError={() => handleImageError(url)}
                                />
                            </div>
                          ))}
                      </div>
                  )}
              </div>
          </ZoomableDiv>
          
          {showNavigation && !isZoomed && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-2 z-10">
                <span className="text-sm bg-gray-800 text-white px-3 py-1 rounded-md shadow-sm">
                    {pagesPerView === 1 
                        ? `Page ${startIndex + 1} of ${imageUrls.length}`
                        : `Page ${startIndex + 1}-${Math.min(startIndex + pagesPerView, imageUrls.length)} of ${imageUrls.length}`
                    }
                </span>
            </div>
          )}
      </div>
    );
}