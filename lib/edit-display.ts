import {useCallback, useContext, useEffect, useRef} from 'react';
import log from './logger';
import {Message} from 'protobufjs';
import {ZoomContext} from '@/app/providers';

// Define EditOperation enum
export enum EditOperation {
    INSERT = 0,
    SUBSTITUTE = 1,
    DELETE = 2
}

/**
 * Helper function to check if two edit lists are equal
 */
function areEditListsEqual(a: Message | null, b: Message | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;

    // Compare serialized versions for deep equality
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
        log.error("Error comparing edit lists:", e);
        return false;
    }
}

/**
 * Function to draw an oval annotation
 * Handles scaling of coordinates and validation
 */
export function drawAnnotation(
  scoreContainer: Element,
  note: any,
  color: string,
  editList: any,
  currentPage: number,
  zoomLevel?: number
) {
    // Constants for logging
    const MAX_INVALID_BBOX_LOGS = 10;
    let invalidBboxLogged = 0;

    // Get page sizes from editList
    const pageSizes = editList.size;
    if (!pageSizes || !Array.isArray(pageSizes)) {
        log.error("Invalid or missing page sizes in notes data");
        return {success: false, invalidBboxLogged};
    }

    // Get page index from note
    const pageIndex = note.page;

    // Get container dimensions and adjust for zoom level
    const containerRect = scoreContainer.getBoundingClientRect();

    // Use provided zoom level or default to 1
    const zoom = zoomLevel || 1;

    // Calculate true dimensions by adjusting for zoom level
    const containerWidth = containerRect.width / zoom;
    const containerHeight = containerRect.height / zoom;

    // Skip if note or bbox is missing
    if (!note || !note.bbox) {
        // Only log first N invalid notes
        if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
            log.warn("Invalid note missing bbox data", {
                noteId: note?.id || 'unknown'
            });
            return {success: false, invalidBboxLogged: invalidBboxLogged + 1};
        }
        return {success: false, invalidBboxLogged};
    }

    // Get page dimensions
    const pageWidth = pageSizes[pageIndex * 2];
    const pageHeight = pageSizes[pageIndex * 2 + 1];

    // Skip if page dimensions are invalid
    if (!pageWidth || !pageHeight || pageWidth <= 0 || pageHeight <= 0) {
        // Only log first N invalid page dimensions
        if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
            log.warn(`Invalid page dimensions for note`, {
                noteId: note.id || 'unknown',
                pageIndex,
                pageWidth,
                pageHeight,
                pageSizes
            });
            return {success: false, invalidBboxLogged: invalidBboxLogged + 1};
        }
        return {success: false, invalidBboxLogged};
    }

    // Skip if container dimensions are invalid
    if (!containerWidth || !containerHeight || containerWidth <= 0 || containerHeight <= 0) {
        // Only log first N invalid container dimensions
        if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
            log.warn('Invalid container dimensions for note', {
                noteId: note.id || 'unknown',
                containerWidth,
                containerHeight
            });
            return {success: false, invalidBboxLogged: invalidBboxLogged + 1};
        }
        return {success: false, invalidBboxLogged};
    }

    // Scale bbox coordinates with validation
    const [x1, y1, x2, y2] = note.bbox;

    // Check for undefined bbox values
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
        // Only log first N invalid bbox values
        if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
            log.warn('Invalid bbox values in note', note);
            return {success: false, invalidBboxLogged: invalidBboxLogged + 1};
        }
        return {success: false, invalidBboxLogged};
    }

    // Calculate the scaled values - now using x1,y1,x2,y2 coordinates
    // 1. Calculate scale and offsets
    const scale = Math.min(containerWidth / pageWidth, containerHeight / pageHeight);
    const offsetX = (containerWidth - pageWidth * scale) / 2;
    const offsetY = (containerHeight - pageHeight * scale) / 2;

    // 2. Scale and shift coordinates
    const scaledX1 = x1 * scale + offsetX;
    const scaledY1 = y1 * scale + offsetY;
    const scaledX2 = x2 * scale + offsetX;
    const scaledY2 = y2 * scale + offsetY;

    // Check for NaN or invalid values and skip if found
    if (isNaN(scaledX1) || isNaN(scaledY1) || isNaN(scaledX2) || isNaN(scaledY2) ||
      !isFinite(scaledX1) || !isFinite(scaledY1) || !isFinite(scaledX2) || !isFinite(scaledY2) ||
      scaledX2 - scaledX1 <= 0 || scaledY2 - scaledY1 <= 0) {
        // Only log first N invalid calculated values
        if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
            log.warn(`Invalid scaled coordinates for note`, {
                noteId: note.id || 'unknown',
                bbox: note.bbox,
                scaled: {x1: scaledX1, y1: scaledY1, x2: scaledX2, y2: scaledY2},
                pageSize: {width: pageWidth, height: pageHeight},
                containerSize: {width: containerWidth, height: containerHeight}
            });
            return {success: false, invalidBboxLogged: invalidBboxLogged + 1};
        }
        return {success: false, invalidBboxLogged};
    }

    // Create oval element
    const oval = document.createElement('div');
    oval.className = 'note-rectangle'; // Keep the same class for consistency

    // Apply positioning with oval shape
    oval.style.cssText = `
        position: absolute;
        left: ${scaledX1}px;
        top: ${scaledY1}px;
        width: ${scaledX2 - scaledX1}px;
        height: ${scaledY2 - scaledY1}px;
        background-color: ${color};
        border: 1px solid ${color.replace('0.5', '1')};
        border-radius: 50%;
        pointer-events: none;
        z-index: 40;
    `;

    scoreContainer.appendChild(oval);
    return {success: true, invalidBboxLogged, element: oval};
}

/**
 * Hook to handle displaying edits on a score
 */
export function useEditDisplay(
  editList: Message | null,
  currentPage: number,
  scoreId: string,
  setEditCount: (count: number) => void
) {
    const lastRenderTimeRef = useRef<number>(0);
    const MIN_RENDER_INTERVAL = 200; // Increased from 100ms to 200ms

    // Get zoom context
    const zoomContext = useContext(ZoomContext);

    // Use a ref to track the scale without causing re-renders
    const currentScaleRef = useRef<number>(1);

    // Update scale ref when zoomContext changes
    useEffect(() => {
        if (zoomContext) {
            currentScaleRef.current = zoomContext.getZoomLevel(scoreId);
        }
    }, [zoomContext, scoreId]);

    // Refs to track previous values
    const prevEditListRef = useRef<Message | null>(null);
    const prevPageRef = useRef<number>(currentPage);
    const renderRequestedRef = useRef<boolean>(false);

    // Function to render edit annotations
    const renderEditAnnotations = useCallback(() => {
        log.debug('Edit display rendering annotations');
        const currentTime = Date.now();
        if (currentTime - lastRenderTimeRef.current < MIN_RENDER_INTERVAL) {
            return;
        }
        lastRenderTimeRef.current = currentTime;
        if (!editList) {
            log.debug('No editList available, skipping edit display');
            return;
        }

        // Check if page is transitioning - don't draw annotations during transitions
        const isTransitioning = document.querySelector('.animate-slide-in-right, .animate-slide-in-left, .animate-slide-out-right, .animate-slide-out-left');
        if (isTransitioning) {
            log.debug('Page is transitioning, skipping annotation rendering');
            return;
        }

        const pageSizes = (editList as any).size;
        if (!pageSizes || !Array.isArray(pageSizes)) {
            log.error("Invalid or missing page sizes in notes data");
            return;
        }

        // Get the score container more reliably - first look for .score-container, then fallback to other elements
        let scoreContainer = document.querySelector('.score-container');

        if (!scoreContainer) {
            // If specific container not found, try the main image container
            scoreContainer = document.querySelector(`#score-${scoreId} .zoomable-content`);
            if (!scoreContainer) {
                // Final fallback - any container within the score view
                scoreContainer = document.querySelector(`#score-${scoreId}`);
            }
        }

        // If still no container, log error and return
        if (!scoreContainer) {
            log.error(`No score container found for page ${currentPage}`);
            return;
        }

        // Log zoom level for debugging
        const currentScale = currentScaleRef.current;
        log.debug(`Using zoom level ${currentScale} for score ${scoreId}`);

        // Clear existing rectangles
        const existingRects = document.querySelectorAll('.note-rectangle');
        log.debug(`Removing ${existingRects.length} existing rectangles`);
        existingRects.forEach(el => el.remove());

        try {
            // Check if editList has necessary properties
            if (!(editList as any).edits || !Array.isArray((editList as any).edits)) {
                log.error('Invalid editList structure - missing edits array');
                return;
            }

            // Filter edits for current page
            const filteredEdits = (editList as any).edits.filter((edit: any) => {
                if (!edit || !edit.sChar || edit.sChar.page === undefined || edit.sChar.page === null) {
                    return false;
                }
                return Number(edit.sChar.page) === Number(currentPage);
            });

            log.debug(`Drawing ${filteredEdits.length} edits for page ${currentPage}`);

            // Track logged page dimensions to avoid repeating
            const loggedPageDimensions = new Set<number>();

            // Track the number of invalid bboxes logged to limit to 10
            let invalidBboxLogged = 0;
            const MAX_INVALID_BBOX_LOGS = 10;

            setEditCount(filteredEdits.length);

            // Process each edit operation
            for (const edit of filteredEdits) {
                const note = edit.sChar;
                let pageIndex = note?.page;

                // Ensure pageSize exists and is valid
                if (pageIndex === undefined || pageIndex < 0 ||
                  pageIndex * 2 >= pageSizes.length ||
                  pageIndex * 2 + 1 >= pageSizes.length) {
                    // Only log first N invalid page indices
                    if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
                        log.warn(`Invalid page index for note`, {
                            note: note,
                            pageIndex,
                            pageSizes: pageSizes,
                            operation: edit.operation
                        });
                        invalidBboxLogged++;
                    }
                    continue;
                }

                // Log page dimensions only once per page number
                if (!loggedPageDimensions.has(pageIndex)) {
                    const pageWidth = pageSizes[pageIndex * 2];
                    const pageHeight = pageSizes[pageIndex * 2 + 1];
                    log.debug(`Page dimensions for page ${pageIndex}: ${pageWidth} x ${pageHeight}`);
                    loggedPageDimensions.add(pageIndex);
                }

                // Determine color based on operation
                let color = 'rgba(0, 0, 0, 0.5)'; // Default color
                switch (edit.operation) {
                    case EditOperation.INSERT:
                        color = 'rgba(0, 255, 0, 0.5)'; // Green for insert
                        break;
                    case EditOperation.DELETE:
                        color = 'rgba(255, 0, 0, 0.5)'; // Red for delete
                        break;
                    case EditOperation.SUBSTITUTE:
                        color = 'rgba(255, 165, 0, 0.5)'; // Orange for substitute
                        break;
                }

                // Draw the source character oval
                const result = drawAnnotation(
                  scoreContainer,
                  note,
                  color,
                  editList,
                  currentPage,
                  currentScale
                );

                // Skip to next edit if this one failed
                if (!result.success) continue;

                // For substitute operations, also draw the target character
                if (edit.operation === EditOperation.SUBSTITUTE && edit.tChar && edit.tChar.bbox) {
                    // Get the target note's bbox
                    const targetNote = edit.tChar;
                    const targetPageIndex = targetNote.page;

                    // Skip if page index is invalid
                    if (targetPageIndex === undefined || targetPageIndex < 0 ||
                      targetPageIndex * 2 >= pageSizes.length ||
                      targetPageIndex * 2 + 1 >= pageSizes.length) {
                        continue;
                    }

                    // Only process if target is on the current page
                    if (Number(targetPageIndex) === Number(currentPage)) {
                        // Draw the target character with a different shade
                        const targetColor = 'rgba(0, 100, 255, 0.5)'; // Blue for target
                        drawAnnotation(
                          scoreContainer,
                          targetNote,
                          targetColor,
                          editList,
                          currentPage,
                          currentScale
                        );
                    }
                }
                // Don't log individual rectangles anymore to reduce console spam
            }

            // If we limited the log output, add a summary
            if (invalidBboxLogged >= MAX_INVALID_BBOX_LOGS) {
                log.warn(`Logging limited after ${MAX_INVALID_BBOX_LOGS} invalid bboxes. More issues may exist.`);
            }
        } catch (error) {
            log.error("Error rendering edit rectangles:", error);
        }
    }, [currentPage, scoreId, editList]);

    // Schedule a render for the next frame if needed
    useEffect(() => {
        // Skip if no edit list
        if (!editList) {
            prevEditListRef.current = null;
            return;
        }

        // Check if we need to render based on changes
        const editListChanged = !areEditListsEqual(editList, prevEditListRef.current);
        const pageChanged = currentPage !== prevPageRef.current;

        if (editListChanged || pageChanged) {
            // Update refs
            prevEditListRef.current = editList;
            prevPageRef.current = currentPage;

            // Schedule render if not already scheduled
            if (!renderRequestedRef.current) {
                renderRequestedRef.current = true;

                // Use requestAnimationFrame to ensure we only render once per frame
                requestAnimationFrame(() => {
                    renderEditAnnotations();
                    renderRequestedRef.current = false;
                });
            }
        }
    }, [editList, currentPage, scoreId, renderEditAnnotations]);

    // Listen for zoom changes and trigger redraw when needed
    useEffect(() => {
        if (!zoomContext) return;

        const prevScale = currentScaleRef.current;
        const newScale = zoomContext.getZoomLevel(scoreId);

        // If scale changed by more than 1%, force a redraw
        if (Math.abs(newScale - prevScale) / prevScale > 0.01) {
            currentScaleRef.current = newScale;
            log.debug(`Zoom level changed significantly (${prevScale} -> ${newScale}), triggering redraw`);

            // Ensure we're not already in the process of rendering
            if (!renderRequestedRef.current && editList) {
                renderRequestedRef.current = true;
                requestAnimationFrame(() => {
                    renderEditAnnotations();
                    renderRequestedRef.current = false;
                });
            }
        }
    }, [zoomContext?.zoomLevels[scoreId], renderEditAnnotations, scoreId, editList]);
}

/**
 * Setup event handlers for edit display
 */
export function setupEditEventHandlers(
  scoreId: string,
  fileId: string | undefined,
  setCurrentPage: (page: number) => void,
  setEditList: (editList: Message | null) => void,
  editList: Message | null,
  currentPage: number
) {
    const lastEventTimeRef = useRef<number>(0);
    const MIN_EVENT_INTERVAL = 200; // Minimum 200ms between event handling

    useEffect(() => {
        const handlePageChange = (event: Event) => {
            const currentTime = Date.now();
            if (currentTime - lastEventTimeRef.current < MIN_EVENT_INTERVAL) return;
            lastEventTimeRef.current = currentTime;

            const customEvent = event as CustomEvent;
            const {currentPage: eventPage, scoreId: eventScoreId} = customEvent.detail;

            log.debug(`Received page change event for scoreId ${eventScoreId}, page ${eventPage}`);
            if (eventScoreId === scoreId || eventScoreId === fileId) {
                log.debug(`Page change accepted for our score. Setting page to ${eventPage}`);
                setCurrentPage(eventPage);
            }
        };

        const handleRedrawAnnotations = (event: Event) => {
            const currentTime = Date.now();
            if (currentTime - lastEventTimeRef.current < MIN_EVENT_INTERVAL) return;
            lastEventTimeRef.current = currentTime;

            const customEvent = event as CustomEvent;
            const {scoreId: eventScoreId, currentPage: eventPage} = customEvent.detail;

            log.debug(`Received redraw annotations for scoreId ${eventScoreId}, page ${eventPage}`);
            if ((eventScoreId === scoreId || eventScoreId === fileId) && editList) {
                log.debug(`Redraw accepted for our score with edits`);

                if (eventPage !== undefined && Number(eventPage) !== Number(currentPage)) {
                    log.debug(`Setting current page to ${eventPage} (was ${currentPage})`);
                    setCurrentPage(eventPage);
                } else {
                    log.debug(`Already on correct page ${currentPage}, forcing redraw`);
                    const tempEditList = editList;
                    setEditList(null);
                    setTimeout(() => setEditList(tempEditList), 50);
                }
            }
        };

        log.debug(`Setting up page change and redraw event listeners for scoreId ${scoreId}`);
        document.addEventListener('score:pageChange', handlePageChange);
        document.addEventListener('score:redrawAnnotations', handleRedrawAnnotations);

        return () => {
            log.debug(`Removing page change and redraw event listeners for scoreId ${scoreId}`);
            document.removeEventListener('score:pageChange', handlePageChange);
            document.removeEventListener('score:redrawAnnotations', handleRedrawAnnotations);
        };
    }, [scoreId, fileId, editList, currentPage, setCurrentPage, setEditList]);
}