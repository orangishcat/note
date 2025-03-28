import React, {useEffect, useRef, useState} from 'react';
import axios from 'axios';
import JSZip from 'jszip';
import Image from 'next/image';
import ZoomableDiv from '@/components/ui-custom/zoomable-div';
import {MusicXMLRendererProps} from '@/components/music-xml-renderer';

export default function ImageScoreRenderer({
                                               scoreId,
                                               recenter,
                                               retry,
                                               pagesPerView = 1, // New optional prop to control 1 or 2 pages per view
                                           }: MusicXMLRendererProps & { pagesPerView?: number }) {
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [isZoomed, setIsZoomed] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationDirection, setAnimationDirection] = useState<'prev' | 'next' | null>(null);
    const [transitionPage, setTransitionPage] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hasFetched = useRef(false);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);
    const mouseStartX = useRef(0);
    const mouseCurrentX = useRef(0);
    const isDragging = useRef(false);

    const fetchScoreFile = async () => {
        try {
            setError(null);
            retry();
            const response = await axios.get(`/api/score/download/${scoreId}`, {
                responseType: 'blob',
            });
            const fileBlob = response.data as Blob;

            if (fileBlob.type === 'application/zip') {
                const zip = await JSZip.loadAsync(fileBlob);
                const urls: string[] = [];
                for (const filename in zip.files) {
                    const zipEntry = zip.files[filename];
                    if (!zipEntry.dir && /\.(png|jpe?g|gif)$/i.test(filename)) {
                        const entryBlob = await zipEntry.async('blob');
                        const url = URL.createObjectURL(entryBlob);
                        urls.push(url);
                    }
                }
                setImageUrls(urls);
            } else if (fileBlob.type.startsWith('image/')) {
                const url = URL.createObjectURL(fileBlob);
                setImageUrls([url]);
            } else {
                console.error('Unsupported file type:', fileBlob.type);
                setError(`Unsupported file type: ${fileBlob.type}`);
            }
        } catch (err) {
            console.error('Error fetching score file:', err);
            setError('Failed to load score. Please try again.');
        }
    };

    // Calculate the total number of views based on page count and pagesPerView setting
    const totalViews = Math.ceil(imageUrls.length / pagesPerView);

    // Handle navigation to previous or next page with animation
    const navigatePages = (direction: 'prev' | 'next') => {
        if (isZoomed || isAnimating) return; // Prevent navigation when zoomed in or already animating
        
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
        // Only handle horizontal scrolling when not zoomed
        if (isZoomed || isAnimating) return;
        
        // Prevent default to avoid page scrolling
        if (Math.abs(e.deltaX) > 20 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            navigatePages(e.deltaX > 0 ? 'next' : 'prev');
        }
    };

    // Handle touch events for swipe navigation
    const handleTouchStart = (e: TouchEvent) => {
        // Prevent browser's back/forward navigation on horizontal swipes
        if (e.touches.length === 1) {
            e.preventDefault();
        }
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: TouchEvent) => {
        touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
        if (isZoomed || isAnimating) return; // Prevent swipe when zoomed in or animating
        
        const swipeThreshold = 50; // Minimum distance for a swipe
        const diff = touchEndX.current - touchStartX.current;
        
        if (Math.abs(diff) > swipeThreshold) {
            navigatePages(diff > 0 ? 'prev' : 'next');
        }
    };

    // Handle mouse drag events for page navigation
    const handleMouseDown = (e: MouseEvent) => {
        if (isZoomed || isAnimating) return;
        
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
        setIsZoomed(scale > 1.05); // Consider zoomed in if scale is greater than 1.05
    };

    useEffect(() => {
        if (hasFetched.current) return;
        hasFetched.current = true;
        fetchScoreFile();
    }, [scoreId]);

    useEffect(() => {
        // Set up event listeners for navigation
        const container = containerRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
            container.addEventListener('touchstart', handleTouchStart, { passive: false });
            container.addEventListener('touchmove', handleTouchMove);
            container.addEventListener('touchend', handleTouchEnd);
            container.addEventListener('mousedown', handleMouseDown as EventListener);
        }
        
        return () => {
            if (container) {
                container.removeEventListener('wheel', handleWheel);
                container.removeEventListener('touchstart', handleTouchStart);
                container.removeEventListener('touchmove', handleTouchMove);
                container.removeEventListener('touchend', handleTouchEnd);
                container.removeEventListener('mousedown', handleMouseDown as EventListener);
            }
            // Clean up any lingering document event listeners
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [currentPageIndex, totalViews, isZoomed, isAnimating]);

    useEffect(() => {
        return () => {
            imageUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [imageUrls]);

    if (error) {
        return (
          <div
            className="flex flex-col items-center justify-center text-center p-4 text-red-600"
            style={{height: 'calc(100vh - 11rem)'}}
          >
              <h1 className="text-xl my-4">{error}</h1>
              <button
                onClick={() => fetchScoreFile()}
                className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded"
              >
                  Retry
              </button>
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
        className="overflow-hidden flex flex-col place-items-center relative"
        style={{height: 'calc(100vh - 7rem)'}}
      >
          <ZoomableDiv 
              recenter={recenter}
              onScaleChange={handleScaleChange}
          >
              {/* Container for the page transition effect */}
              <div 
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
