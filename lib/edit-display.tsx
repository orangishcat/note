import { useEffect } from 'react';
import log from './logger';
import { Message } from 'protobufjs';

// Define EditOperation enum
export enum EditOperation {
    INSERT = 0,
    SUBSTITUTE = 1,
    DELETE = 2
}

/**
 * Hook to handle displaying edits on a score
 */
export function useEditDisplay(
    editList: Message | null, 
    notes: Message | null, 
    currentPage: number,
    scoreId: string
) {
    // Effect to render edit annotations
    useEffect(() => {
        log.trace(editList);
        if (!editList || !notes) return;

        const pageSizes = (notes as any).size;

        // Get the score container more reliably - first look for .score-container, then fallback to other elements
        let scoreContainer = document.querySelector('.score-container');
        
        // If specific container not found, try the main image container
        if (!scoreContainer) {
            scoreContainer = document.querySelector(`#score-${scoreId} .zoomable-content`);
        }
        
        // Final fallback - any container within the score view
        if (!scoreContainer) {
            scoreContainer = document.querySelector(`#score-${scoreId}`);
        }
        
        // If still no container, log error and return
        if (!scoreContainer) {
            log.error(`No score container found for page ${currentPage}`);
            return;
        }

        // Clear existing rectangles
        document.querySelectorAll('.note-rectangle').forEach(el => el.remove());

        // Log before processing edits
        const filteredEdits = (editList as any).edits.filter((edit: any) => 
            Number(edit.sChar.page) === Number(currentPage)
        );
        log.info(`Drawing ${filteredEdits.length} edits for page ${currentPage}`);

        // Process each edit operation
        for (const edit of filteredEdits) {
            const note = edit.sChar;
            const pageIndex = note.page;

            const pageSize = [pageSizes[pageIndex * 2], pageSizes[pageIndex * 2 + 1]];

            // Get container dimensions
            const containerRect = scoreContainer.getBoundingClientRect();
            const containerWidth = containerRect.width;
            const containerHeight = containerRect.height;

            // Scale bbox coordinates
            log.trace(note.bbox);
            const [x, y, w, h] = note.bbox;
            const scaledX = (x / pageSize[0]) * containerWidth;
            const scaledY = (y / pageSize[1]) * containerHeight;
            const scaledW = (w / pageSize[0]) * containerWidth;
            const scaledH = (h / pageSize[1]) * containerHeight;

            // Create rectangle element
            const rect = document.createElement('div');
            rect.className = 'note-rectangle';

            // Set color based on operation
            let color = 'rgba(0, 0, 0, 0.3)'; // Default color
            switch (edit.operation) {
                case EditOperation.INSERT:
                    color = 'rgba(0, 255, 0, 0.3)'; // Green for insert
                    break;
                case EditOperation.DELETE:
                    color = 'rgba(255, 0, 0, 0.3)'; // Red for delete
                    break;
                case EditOperation.SUBSTITUTE:
                    color = 'rgba(255, 165, 0, 0.3)'; // Orange for substitute
                    break;
            }

            rect.style.cssText = `
            position: absolute;
            left: ${scaledX}px;
            top: ${scaledY}px;
            width: ${scaledW}px;
            height: ${scaledH}px;
            background-color: ${color};
            border: 2px solid ${color.replace('0.3', '1')};
            pointer-events: none;
            z-index: 40;
        `;

            scoreContainer.appendChild(rect);
        }
    }, [editList, notes, currentPage, scoreId]);

    // Hook for event listeners
    useEffect(() => {
        const handlePageChange = (event: Event) => {
            const customEvent = event as CustomEvent;
            const {currentPage: eventPage, scoreId: eventScoreId} = customEvent.detail;

            if (eventScoreId === scoreId) {
                log.debug(`Received page change to ${eventPage}`);
                // This is now handled by the parent component
            }
        };

        // Listen for redraw annotation events
        const handleRedrawAnnotations = (event: Event) => {
            const customEvent = event as CustomEvent;
            const {scoreId: eventScoreId, currentPage: eventPage} = customEvent.detail;
            
            // Only process if this is for our score
            if (eventScoreId === scoreId) {
                log.debug(`Received annotation redraw for page ${eventPage}`);
                // This is now handled by the parent component
            }
        };

        // Listen for page change events
        document.addEventListener('score:pageChange', handlePageChange);
        document.addEventListener('score:redrawAnnotations', handleRedrawAnnotations);

        return () => {
            document.removeEventListener('score:pageChange', handlePageChange);
            document.removeEventListener('score:redrawAnnotations', handleRedrawAnnotations);
        };
    }, [scoreId]);
}

/**
 * Setup event handlers for edit display
 */
export function setupEditEventHandlers(
    scoreId: string,
    setCurrentPage: (page: number) => void,
    setEditList: (editList: Message | null) => void,
    editList: Message | null,
    currentPage: number
) {
    // Handle page change events
    const handlePageChange = (event: Event) => {
        const customEvent = event as CustomEvent;
        const {currentPage: eventPage, scoreId: eventScoreId} = customEvent.detail;

        if (eventScoreId === scoreId) {
            log.debug(`Received page change to ${eventPage}`);
            setCurrentPage(eventPage);
        }
    };

    // Handle redraw annotation events
    const handleRedrawAnnotations = (event: Event) => {
        const customEvent = event as CustomEvent;
        const {scoreId: eventScoreId, currentPage: eventPage} = customEvent.detail;
        
        // Only process if this is for our score and we have edits to draw
        if (eventScoreId === scoreId && editList) {
            log.debug(`Received annotation redraw for page ${eventPage}`);
            
            // Force redraw by ensuring we're on the right page
            if (eventPage !== undefined && Number(eventPage) !== Number(currentPage)) {
                log.debug(`Setting current page to ${eventPage} (was ${currentPage})`);
                setCurrentPage(eventPage);
            } else {
                // Force a redraw by updating the edit list
                const tempEditList = editList;
                setEditList(null);
                setTimeout(() => setEditList(tempEditList), 50);
            }
        }
    };

    useEffect(() => {
        // Listen for page change events
        document.addEventListener('score:pageChange', handlePageChange);
        document.addEventListener('score:redrawAnnotations', handleRedrawAnnotations);

        return () => {
            document.removeEventListener('score:pageChange', handlePageChange);
            document.removeEventListener('score:redrawAnnotations', handleRedrawAnnotations);
        };
    }, [scoreId, editList, currentPage]);
} 