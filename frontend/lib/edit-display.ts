import { useCallback, useContext, useEffect, useRef } from "react";
import log from "./logger";
import { Message } from "protobufjs";
import { ZoomContext } from "@/app/providers";

// Define EditOperation enum
export enum EditOperation {
  INSERT = 0,
  SUBSTITUTE = 1,
  DELETE = 2,
}

// Global state for showing note names
let showNoteNames = false;

// Function to convert MIDI pitch to note name
export function midiPitchToNoteName(midiPitch: number): string {
  if (midiPitch === undefined || midiPitch === null) return "";

  const noteNames = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const octave = Math.floor(midiPitch / 12) - 1;
  const noteIndex = midiPitch % 12;

  return `${noteNames[noteIndex]}${octave}`;
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
  zoomLevel?: number,
  isTarget: boolean = false,
  targetNote?: any, // Pass the target note for substitutions
  editOperation?: EditOperation,
  position?: number, // Add position parameter
) {
  // Constants for logging
  const MAX_INVALID_BBOX_LOGS = 10;
  let invalidBboxLogged = 0;

  // Get page sizes from editList
  const pageSizes = editList.size;
  if (!pageSizes || !Array.isArray(pageSizes)) {
    log.error("Invalid or missing page sizes in notes scores");
    return { success: false, invalidBboxLogged };
  }

  // Get page index from note
  let pageIndex = note.page;

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
      log.warn("Invalid note missing bbox scores", {
        noteId: note?.id || "unknown",
      });
      return { success: false, invalidBboxLogged: invalidBboxLogged + 1 };
    }
    return { success: false, invalidBboxLogged };
  }

  // Get page dimensions
  // If pageSizes has length 2 (1 page), use the first page index (0,1) for all pages
  pageIndex = pageSizes.length === 2 ? 0 : pageIndex;
  const pageWidth = pageSizes[pageIndex * 2];
  const pageHeight = pageSizes[pageIndex * 2 + 1];

  // Skip if page dimensions are invalid
  if (!pageWidth || !pageHeight || pageWidth <= 0 || pageHeight <= 0) {
    // Only log first N invalid page dimensions
    if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
      log.warn(`Invalid page dimensions for note`, {
        noteId: note.id || "unknown",
        pageIndex,
        pageWidth,
        pageHeight,
        pageSizes,
      });
      return { success: false, invalidBboxLogged: invalidBboxLogged + 1 };
    }
    return { success: false, invalidBboxLogged };
  }

  // Skip if container dimensions are invalid
  if (
    !containerWidth ||
    !containerHeight ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    // Only log first N invalid container dimensions
    if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
      log.warn("Invalid container dimensions for note", {
        noteId: note.id || "unknown",
        containerWidth,
        containerHeight,
      });
      return { success: false, invalidBboxLogged: invalidBboxLogged + 1 };
    }
    return { success: false, invalidBboxLogged };
  }

  // Scale bbox coordinates with validation
  const [x1, y1, x2, y2] = note.bbox;

  // Check for undefined bbox values
  if (
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined
  ) {
    // Only log first N invalid bbox values
    if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
      log.warn("Invalid bbox values in note", note);
      return { success: false, invalidBboxLogged: invalidBboxLogged + 1 };
    }
    return { success: false, invalidBboxLogged };
  }

  // Calculate the scaled values - now using x1,y1,x2,y2 coordinates
  // 1. Calculate scale and offsets
  const scale = Math.min(
    containerWidth / pageWidth,
    containerHeight / pageHeight,
  );
  const offsetX = (containerWidth - pageWidth * scale) / 2;
  const offsetY = (containerHeight - pageHeight * scale) / 2;

  // 2. Scale and shift coordinates
  const scaledX1 = x1 * scale + offsetX;
  const scaledY1 = y1 * scale + offsetY;
  const scaledX2 = x2 * scale + offsetX;
  const scaledY2 = y2 * scale + offsetY;

  // Check for NaN or invalid values and skip if found
  if (
    isNaN(scaledX1) ||
    isNaN(scaledY1) ||
    isNaN(scaledX2) ||
    isNaN(scaledY2) ||
    !isFinite(scaledX1) ||
    !isFinite(scaledY1) ||
    !isFinite(scaledX2) ||
    !isFinite(scaledY2) ||
    scaledX2 - scaledX1 <= 0 ||
    scaledY2 - scaledY1 <= 0
  ) {
    // Only log first N invalid calculated values
    if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
      log.warn(`Invalid scaled coordinates for note`, {
        noteId: note.id || "unknown",
        bbox: note.bbox,
        scaled: { x1: scaledX1, y1: scaledY1, x2: scaledX2, y2: scaledY2 },
        pageSize: { width: pageWidth, height: pageHeight },
        containerSize: { width: containerWidth, height: containerHeight },
      });
      return { success: false, invalidBboxLogged: invalidBboxLogged + 1 };
    }
    return { success: false, invalidBboxLogged };
  }

  // Create oval element
  const oval = document.createElement("div");
  oval.className = "note-rectangle"; // Keep the same class for consistency

  // Apply positioning with oval shape
  oval.style.cssText = `
        position: absolute;
        left: ${scaledX1}px;
        top: ${scaledY1}px;
        width: ${scaledX2 - scaledX1}px;
        height: ${scaledY2 - scaledY1}px;
        background-color: ${color};
        border: 1px solid ${color.replace("0.5", "1")};
        border-radius: 50%;
        z-index: 40;
    `;

  // Make the oval clickable
  oval.style.pointerEvents = "auto";
  oval.style.cursor = "pointer";

  // Store note scores for comparison dialog
  oval.dataset.noteId = note.id?.toString() || "";
  oval.dataset.notePitch = note.pitch?.toString() || "";

  // Add click event to trigger comparison dialog
  oval.addEventListener("click", (e) => {
    e.stopPropagation();
    // Dispatch custom event for comparison dialog
    const event = new CustomEvent("edit:showComparison", {
      detail: {
        note,
        targetNote,
        editOperation:
          editOperation !== undefined
            ? EditOperation[editOperation]
            : undefined,
        isTarget,
        position,
      },
      bubbles: true,
    });
    document.dispatchEvent(event);
  });

  scoreContainer.appendChild(oval);

  return { success: true, invalidBboxLogged, element: oval };
}

/**
 * Hook to handle displaying edits on a score
 */
export function useEditDisplay(
  editList: Message | null,
  currentPage: number,
  scoreId: string,
  setEditCount: (count: number) => void,
  scoreNotes?: Message | null,
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

  // Listen for note name display toggle events
  useEffect(() => {
    const handleToggleNoteNames = (event: Event) => {
      const customEvent = event as CustomEvent;
      showNoteNames = customEvent.detail.showNoteNames;

      // Request a redraw when the setting changes
      if (editList) {
        if (!renderRequestedRef.current) {
          renderRequestedRef.current = true;
          requestAnimationFrame(() => {
            renderEditAnnotations();
            renderRequestedRef.current = false;
          });
        }
      }
    };

    document.addEventListener("debug:toggleNoteNames", handleToggleNoteNames);

    return () => {
      document.removeEventListener(
        "debug:toggleNoteNames",
        handleToggleNoteNames,
      );
    };
  }, [editList]);

  // Type definition for label position tracking
  type LabelPosition = {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Function to render edit annotations
  const renderEditAnnotations = useCallback(() => {
    const currentTime = Date.now();
    if (currentTime - lastRenderTimeRef.current < MIN_RENDER_INTERVAL) {
      // Schedule another attempt after the interval
      setTimeout(() => {
        if (renderRequestedRef.current) {
          renderEditAnnotations();
        }
      }, MIN_RENDER_INTERVAL);
      return;
    }
    lastRenderTimeRef.current = currentTime;
    if (!editList) {
      log.debug("No editList available, skipping edit display");
      return;
    }

    // Check if page is transitioning - don't draw annotations during transitions
    const isTransitioning = document.querySelector(
      ".animate-slide-in-right, .animate-slide-in-left, .animate-slide-out-right, .animate-slide-out-left",
    );
    if (isTransitioning) {
      log.debug("Page is transitioning, scheduling redraw after transition");
      // Schedule a redraw after transition completes
      setTimeout(() => renderEditAnnotations(), 350);
      return;
    }

    const pageSizes = (editList as any).size;
    if (!pageSizes || !Array.isArray(pageSizes)) {
      log.error("Invalid or missing page sizes in notes scores");
      return;
    }

    // Get the score container more reliably - first look for .score-container, then fallback to other elements
    let scoreContainer = document.querySelector(".score-container");

    if (!scoreContainer) {
      // If specific container not found, try the main image container
      scoreContainer = document.querySelector(
        `#score-${scoreId} .zoomable-content`,
      );
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

    // Clear existing rectangles and note labels
    const existingRects = document.querySelectorAll(
      ".note-rectangle, .note-label, .tempo-bracket",
    );
    existingRects.forEach((el) => el.remove());

    // Create an array to track label positions
    const labelPositions: LabelPosition[] = [];

    // Function to find a non-overlapping position for a label
    const findNonOverlappingPosition = (
      x: number,
      y: number,
      width: number,
      height: number,
    ): { x: number; y: number } => {
      // Initial position
      let posX = x;
      let posY = y;

      // Set standard offset amount
      const OFFSET_Y = 16; // Vertical offset amount
      const OFFSET_X = 10; // Horizontal offset amount

      // Function to check if a position overlaps with any existing label
      const hasOverlap = (
        x: number,
        y: number,
        width: number,
        height: number,
      ): boolean => {
        for (const pos of labelPositions) {
          // Simple box collision detection
          if (
            x < pos.x + pos.width &&
            x + width > pos.x &&
            y < pos.y + pos.height &&
            y + height > pos.y
          ) {
            return true;
          }
        }
        return false;
      };

      // Try different offsets to find a non-overlapping position
      // Start with no offset, then try moving up, then diagonally
      const maxAttempts = 10;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!hasOverlap(posX, posY, width, height)) {
          break;
        }

        // First try increasing vertical offset
        if (attempt < 5) {
          posY -= OFFSET_Y;
        }
        // Then try horizontal offset as well
        else {
          posX += attempt % 2 === 0 ? OFFSET_X : -OFFSET_X; // Alternate left and right
          posY -= OFFSET_Y / 2; // Still move up but less
        }
      }

      return { x: posX, y: posY };
    };

    try {
      // Check if editList has necessary properties
      if (!(editList as any).edits || !Array.isArray((editList as any).edits)) {
        log.error("Invalid editList structure - missing edits array");
        return;
      }

      // Filter edits for current page
      const filteredEdits = (editList as any).edits.filter((edit: any) => {
        if (
          !edit ||
          !edit.sChar ||
          edit.sChar.page === undefined ||
          edit.sChar.page === null
        ) {
          return false;
        }
        return Number(edit.sChar.page) === Number(currentPage);
      });

      // Track logged page dimensions to avoid repeating
      const loggedPageDimensions = new Set<number>();

      // Track the number of invalid bboxes logged to limit to 10
      let invalidBboxLogged = 0;
      const MAX_INVALID_BBOX_LOGS = 10;

      setEditCount(filteredEdits.length);

      // First, collect all notes that need labels for position planning
      const notesWithLabels: any[] = [];

      // Process each edit operation and collect target notes that need labels
      for (const edit of filteredEdits) {
        // Only collect substitute operations' target notes
        if (
          edit.operation === EditOperation.SUBSTITUTE &&
          edit.tChar &&
          edit.tChar.bbox
        ) {
          const targetNote = edit.tChar;
          const targetPageIndex = edit.sChar.page;

          // Skip if page index is invalid
          if (
            targetPageIndex === undefined ||
            targetPageIndex < 0 ||
            (pageSizes.length !== 2 &&
              (targetPageIndex * 2 >= pageSizes.length ||
                targetPageIndex * 2 + 1 >= pageSizes.length))
          ) {
            continue;
          }

          // Only include if target is on the current page
          if (Number(targetPageIndex) === Number(currentPage)) {
            notesWithLabels.push({
              note: targetNote,
              sourceNote: edit.sChar,
            });
          }
        }
      }

      // Process each edit operation
      for (const edit of filteredEdits) {
        const note = edit.sChar;
        let pageIndex = note?.page;

        // Ensure pageSize exists and is valid
        if (
          pageIndex === undefined ||
          pageIndex < 0 ||
          (pageSizes.length !== 2 &&
            (pageIndex * 2 >= pageSizes.length ||
              pageIndex * 2 + 1 >= pageSizes.length))
        ) {
          // Only log first N invalid page indices
          if (invalidBboxLogged < MAX_INVALID_BBOX_LOGS) {
            log.warn(`Invalid page index for note`, {
              note: note,
              pageIndex,
              pageSizes: pageSizes,
              operation: edit.operation,
            });
            invalidBboxLogged++;
          }
          continue;
        }

        // Log page dimensions only once per page number
        if (!loggedPageDimensions.has(pageIndex)) {
          // If pageSizes has length 4 (2 pages), use the first page index (0,1) for all pages
          const useFirstPageIndex = pageSizes.length === 4;
          const effectivePageIndex = useFirstPageIndex ? 0 : pageIndex;
          const pageWidth = pageSizes[effectivePageIndex * 2];
          const pageHeight = pageSizes[effectivePageIndex * 2 + 1];
          log.debug(
            `Page dimensions for page ${pageIndex}: ${pageWidth} x ${pageHeight}`,
          );
          loggedPageDimensions.add(pageIndex);
        }

        // Determine color based on operation
        let color = "rgba(0, 0, 0, 0.5)"; // Default color
        switch (edit.operation) {
          case EditOperation.INSERT:
            color = "rgba(0, 255, 0, 0.5)"; // Green for insert
            // Handle invalid bbox for INSERT operations
            if (edit.tChar && (!edit.tChar.bbox || !edit.tChar.bbox.length)) {
              // Get the source note for reference
              log.debug("Invalid bbox for INSERT operation");
              if (edit.sChar && edit.sChar.bbox && edit.sChar.bbox.length) {
                const diff = edit.tChar.pitch - edit.sChar.pitch;
                const size = edit.sChar.bbox[3] - edit.sChar.bbox[1];
                // Create a new bbox using the source note's bbox with vertical adjustment
                edit.tChar.bbox = [...edit.sChar.bbox]; // Create a copy to avoid modifying the original
                edit.tChar.bbox[1] =
                  edit.sChar.bbox[1] + (size * Math.floor(diff / 2)) / 2;
                edit.tChar.bbox[3] =
                  edit.sChar.bbox[3] + (size * Math.floor(diff / 2)) / 2;
              }
            }
            break;
          case EditOperation.DELETE:
            color = "rgba(255, 0, 0, 0.5)"; // Red for delete
            break;
          case EditOperation.SUBSTITUTE:
            color = "rgba(255, 165, 0, 0.5)"; // Orange for substitute
            break;
        }

        // Draw the source character oval
        const result = drawAnnotation(
          scoreContainer,
          note,
          color,
          editList,
          currentPage,
          currentScale,
          false,
          edit.tChar,
          edit.operation,
          edit.pos,
        );

        // Skip to next edit if this one failed
        if (!result.success) continue;

        // For substitute operations, also draw the target character
        if (edit.operation === EditOperation.SUBSTITUTE && edit.tChar) {
          // Get the target note's bbox
          const targetNote = edit.tChar;
          const targetPageIndex = edit.sChar.page;

          // Skip if page index is invalid
          if (
            targetPageIndex === undefined ||
            targetPageIndex < 0 ||
            (pageSizes.length !== 2 &&
              (targetPageIndex * 2 >= pageSizes.length ||
                targetPageIndex * 2 + 1 >= pageSizes.length))
          ) {
            log.warn(
              `Invalid page index for target note in substitute operation`,
              {
                note: targetNote,
                pageIndex: targetPageIndex,
                pageSizes: pageSizes,
              },
            );
            continue;
          }

          // Create bbox for target note if it doesn't exist
          if (!targetNote.bbox || !targetNote.bbox.length) {
            const diff = edit.sChar.pitch - targetNote.pitch;
            const size = edit.sChar.bbox[3] - edit.sChar.bbox[1];
            // Create a new bbox using the source note's bbox with vertical adjustment
            targetNote.bbox = [...edit.sChar.bbox]; // Create a copy to avoid modifying the original
            targetNote.bbox[1] =
              edit.sChar.bbox[1] + (size * Math.floor(diff / 2)) / 2;
            targetNote.bbox[3] =
              edit.sChar.bbox[3] + (size * Math.floor(diff / 2)) / 2;
          }

          // Only process if target is on the current page
          if (Number(targetPageIndex) === Number(currentPage)) {
            // Draw the target character with a different shade
            const targetColor = "rgba(0, 100, 255, 0.5)"; // Blue for target

            // Draw the annotation
            const targetResult = drawAnnotation(
              scoreContainer,
              targetNote,
              targetColor,
              editList,
              currentPage,
              currentScale,
              true, // This is a target note
              note, // Pass the source note for comparison
              edit.operation,
              edit.pos,
            );

            // Add note name label if enabled and target has pitch info
            if (
              showNoteNames &&
              targetNote.pitch !== undefined &&
              targetResult.success
            ) {
              const [x1, y1, x2] = targetNote.bbox;

              // Calculate a position for the label
              const centerX = (x1 + x2) / 2;

              // Scale coordinates
              const containerRect = scoreContainer.getBoundingClientRect();
              const containerWidth = containerRect.width / currentScale;
              const containerHeight = containerRect.height / currentScale;

              // Get page dimensions with proper index
              const pageIndex = pageSizes.length === 2 ? 0 : targetNote.page;
              const pageWidth = pageSizes[pageIndex * 2];
              const pageHeight = pageSizes[pageIndex * 2 + 1];

              const scale = Math.min(
                containerWidth / pageWidth,
                containerHeight / pageHeight,
              );
              const offsetX = (containerWidth - pageWidth * scale) / 2;
              const offsetY = (containerHeight - pageHeight * scale) / 2;

              const scaledCenterX = centerX * scale + offsetX;
              const scaledTopY = y1 * scale + offsetY;

              // Get note name from pitch
              const noteName = midiPitchToNoteName(targetNote.pitch);

              // Get the source note name for comparison if available
              let sourceNoteName = "";
              if (note && note.pitch !== undefined) {
                sourceNoteName = midiPitchToNoteName(note.pitch);
              }

              // Prepare label text
              let labelText;
              if (sourceNoteName) {
                // Calculate semitone difference
                const semitonesDiff = targetNote.pitch - note.pitch;
                const direction = semitonesDiff > 0 ? "▲" : "▼"; // Up or down arrow
                labelText = `${noteName} (${direction}${Math.abs(
                  semitonesDiff,
                )})`;
              } else {
                labelText = noteName;
              }

              // Estimate label dimensions based on text length
              const labelWidth = 10 + labelText.length * 6; // Approximate width
              const labelHeight = 18; // Approximate height

              // Position 20px above the note by default
              const initialX = scaledCenterX - labelWidth / 2;
              const initialY = scaledTopY - 20;

              // Find a non-overlapping position
              const { x: adjustedX, y: adjustedY } = findNonOverlappingPosition(
                initialX,
                initialY,
                labelWidth,
                labelHeight,
              );

              // Create the label element
              const noteLabel = document.createElement("div");
              noteLabel.className = "note-label";

              // Apply styling to the label
              noteLabel.style.cssText = `
                                position: absolute;
                                left: ${adjustedX}px;
                                top: ${adjustedY}px;
                                padding: 2px 4px;
                                background-color: rgba(0, 0, 0, 0.7);
                                color: ${targetColor.replace("0.5", "1")};
                                border-radius: 3px;
                                font-size: 10px;
                                font-family: monospace;
                                text-align: center;
                                min-width: ${labelWidth}px;
                                height: ${labelHeight}px;
                                white-space: nowrap;
                                pointer-events: none;
                                z-index: 50;
                            `;

              // Set the label text
              noteLabel.innerHTML = labelText;

              // Add to DOM
              scoreContainer.appendChild(noteLabel);

              // Add to tracking array to avoid future overlaps
              labelPositions.push({
                x: adjustedX,
                y: adjustedY,
                width: labelWidth,
                height: labelHeight,
              });

              // Draw connector line from label to note
              if (
                showNoteNames &&
                (Math.abs(adjustedY - initialY) > 5 ||
                  Math.abs(adjustedX - initialX) > 5)
              ) {
                const connector = document.createElement("div");
                connector.className = "note-connector";

                // Calculate connector position and length
                const connectorStartX = adjustedX + labelWidth / 2;
                const connectorStartY = adjustedY + labelHeight;

                const connectorEndX = scaledCenterX;
                const connectorEndY = scaledTopY;

                // Calculate angle and length
                const angle = Math.atan2(
                  connectorEndY - connectorStartY,
                  connectorEndX - connectorStartX,
                );
                const length = Math.sqrt(
                  Math.pow(connectorEndX - connectorStartX, 2) +
                    Math.pow(connectorEndY - connectorStartY, 2),
                );

                // Apply styling to create angled line
                connector.style.cssText = `
                                    position: absolute;
                                    left: ${connectorStartX}px;
                                    top: ${connectorStartY}px;
                                    width: ${length}px;
                                    height: 1px;
                                    background-color: ${targetColor.replace(
                                      "0.5",
                                      "0.7",
                                    )};
                                    transform: rotate(${angle}rad);
                                    transform-origin: 0 0;
                                    pointer-events: none;
                                    z-index: 49;
                                `;

                scoreContainer.appendChild(connector);
              }
            }
          }
        }
        // For insert operations, also draw the target character
        else if (edit.operation === EditOperation.INSERT && edit.tChar) {
          // Get the target note's bbox
          const targetNote = edit.tChar;
          const targetPageIndex = edit.sChar.page;

          // Skip if page index is invalid
          if (
            targetPageIndex === undefined ||
            targetPageIndex < 0 ||
            (pageSizes.length !== 2 &&
              (targetPageIndex * 2 >= pageSizes.length ||
                targetPageIndex * 2 + 1 >= pageSizes.length))
          ) {
            log.warn(`Invalid page index for target note in insert operation`, {
              note: targetNote,
              pageIndex: targetPageIndex,
              pageSizes: pageSizes,
            });
            continue;
          }

          // Only process if target is on the current page
          if (Number(targetPageIndex) === Number(currentPage)) {
            // Draw the target character with a different shade
            const targetColor = "rgba(0, 200, 100, 0.5)"; // Lighter green for target

            // Draw the annotation
            const targetResult = drawAnnotation(
              scoreContainer,
              targetNote,
              targetColor,
              editList,
              currentPage,
              currentScale,
              true, // This is a target note
              note, // Pass the source note for comparison
              edit.operation,
              edit.pos,
            );

            // Add note name label if enabled and target has pitch info (same as substitute)
            if (
              showNoteNames &&
              targetNote.pitch !== undefined &&
              targetResult.success
            ) {
              const [x1, y1, x2] = targetNote.bbox;

              // Calculate a position for the label
              const centerX = (x1 + x2) / 2;

              // Scale coordinates
              const containerRect = scoreContainer.getBoundingClientRect();
              const containerWidth = containerRect.width / currentScale;
              const containerHeight = containerRect.height / currentScale;

              // Get page dimensions with proper index
              const pageIndex = pageSizes.length === 2 ? 0 : targetNote.page;
              const pageWidth = pageSizes[pageIndex * 2];
              const pageHeight = pageSizes[pageIndex * 2 + 1];

              const scale = Math.min(
                containerWidth / pageWidth,
                containerHeight / pageHeight,
              );
              const offsetX = (containerWidth - pageWidth * scale) / 2;
              const offsetY = (containerHeight - pageHeight * scale) / 2;

              const scaledCenterX = centerX * scale + offsetX;
              const scaledTopY = y1 * scale + offsetY;

              // Get note name from pitch
              const noteName = midiPitchToNoteName(targetNote.pitch);

              // Get the source note name for comparison if available
              let sourceNoteName = "";
              if (note && note.pitch !== undefined) {
                sourceNoteName = midiPitchToNoteName(note.pitch);
              }

              // Prepare label text
              let labelText;
              if (sourceNoteName) {
                // Calculate semitone difference
                const semitonesDiff = targetNote.pitch - note.pitch;
                const direction = semitonesDiff > 0 ? "▲" : "▼"; // Up or down arrow
                labelText = `${noteName} (${direction}${Math.abs(
                  semitonesDiff,
                )})`;
              } else {
                labelText = noteName;
              }

              // Estimate label dimensions based on text length
              const labelWidth = 10 + labelText.length * 6; // Approximate width
              const labelHeight = 18; // Approximate height

              // Position 20px above the note by default
              const initialX = scaledCenterX - labelWidth / 2;
              const initialY = scaledTopY - 20;

              // Find a non-overlapping position
              const { x: adjustedX, y: adjustedY } = findNonOverlappingPosition(
                initialX,
                initialY,
                labelWidth,
                labelHeight,
              );

              // Create the label element
              const noteLabel = document.createElement("div");
              noteLabel.className = "note-label";

              // Apply styling to the label
              noteLabel.style.cssText = `
                                position: absolute;
                                left: ${adjustedX}px;
                                top: ${adjustedY}px;
                                padding: 2px 4px;
                                background-color: rgba(0, 0, 0, 0.7);
                                color: ${targetColor.replace("0.5", "1")};
                                border-radius: 3px;
                                font-size: 10px;
                                font-family: monospace;
                                text-align: center;
                                min-width: ${labelWidth}px;
                                height: ${labelHeight}px;
                                white-space: nowrap;
                                pointer-events: none;
                                z-index: 50;
                            `;

              // Set the label text
              noteLabel.innerHTML = labelText;

              // Add to DOM
              scoreContainer.appendChild(noteLabel);

              // Add to tracking array to avoid future overlaps
              labelPositions.push({
                x: adjustedX,
                y: adjustedY,
                width: labelWidth,
                height: labelHeight,
              });

              // Draw connector line from label to note
              if (
                showNoteNames &&
                (Math.abs(adjustedY - initialY) > 5 ||
                  Math.abs(adjustedX - initialX) > 5)
              ) {
                const connector = document.createElement("div");
                connector.className = "note-connector";

                // Calculate connector position and length
                const connectorStartX = adjustedX + labelWidth / 2;
                const connectorStartY = adjustedY + labelHeight;

                const connectorEndX = scaledCenterX;
                const connectorEndY = scaledTopY;

                // Calculate angle and length
                const angle = Math.atan2(
                  connectorEndY - connectorStartY,
                  connectorEndX - connectorStartX,
                );
                const length = Math.sqrt(
                  Math.pow(connectorEndX - connectorStartX, 2) +
                    Math.pow(connectorEndY - connectorStartY, 2),
                );

                // Apply styling to create angled line
                connector.style.cssText = `
                                    position: absolute;
                                    left: ${connectorStartX}px;
                                    top: ${connectorStartY}px;
                                    width: ${length}px;
                                    height: 1px;
                                    background-color: ${targetColor.replace(
                                      "0.5",
                                      "0.7",
                                    )};
                                    transform: rotate(${angle}rad);
                                    transform-origin: 0 0;
                                    pointer-events: none;
                                    z-index: 49;
                                `;

                scoreContainer.appendChild(connector);
              }
            }
          }
        }
        // Don't log individual rectangles anymore to reduce console spam
      }

      // Draw tempo sections
      if (scoreNotes && (editList as any).tempoSections) {
        const sections = (editList as any).tempoSections as any[];
        sections.forEach((ts: any) => {
          const startNote = (scoreNotes as any).notes?.[ts.startIndex];
          const endNote = (scoreNotes as any).notes?.[ts.endIndex];
          if (!startNote || !endNote) return;
          if (Number(startNote.page) !== Number(currentPage)) return;

          const pageIndex = pageSizes.length === 2 ? 0 : startNote.page;
          const pageWidth = pageSizes[pageIndex * 2];
          const pageHeight = pageSizes[pageIndex * 2 + 1];

          const containerRect = scoreContainer.getBoundingClientRect();
          const containerWidth = containerRect.width / currentScale;
          const containerHeight = containerRect.height / currentScale;
          const scale = Math.min(
            containerWidth / pageWidth,
            containerHeight / pageHeight,
          );
          const offsetX = (containerWidth - pageWidth * scale) / 2;
          const offsetY = (containerHeight - pageHeight * scale) / 2;

          const left = startNote.bbox[0] * scale + offsetX;
          const right = endNote.bbox[2] * scale + offsetX;
          const top = startNote.bbox[1] * scale + offsetY - 10;

          const bracket = document.createElement("div");
          bracket.className = "tempo-bracket";
          bracket.style.cssText = `
              position:absolute;
              left:${left}px;
              top:${top}px;
              width:${right - left}px;
              height:8px;
              border-left:2px solid rgba(0,0,255,0.7);
              border-right:2px solid rgba(0,0,255,0.7);
              border-bottom:2px solid rgba(0,0,255,0.7);
              pointer-events:none;
              z-index:45;
          `;
          scoreContainer.appendChild(bracket);
        });
      }

      // If we limited the log output, add a summary
      if (invalidBboxLogged >= MAX_INVALID_BBOX_LOGS) {
        log.warn(
          `Logging limited after ${MAX_INVALID_BBOX_LOGS} invalid bboxes. More issues may exist.`,
        );
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
    const editListChanged = !areEditListsEqual(
      editList,
      prevEditListRef.current,
    );
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
  }, [editList, currentPage, scoreId, scoreNotes, renderEditAnnotations]);

  // Listen for zoom changes and trigger redraw when needed
  useEffect(() => {
    if (!zoomContext) return;

    const prevScale = currentScaleRef.current;
    const newScale = zoomContext.getZoomLevel(scoreId);

    // If scale changed by more than 1%, force a redraw
    if (Math.abs(newScale - prevScale) / prevScale > 0.01) {
      currentScaleRef.current = newScale;
      log.debug(
        `Zoom level changed significantly (${prevScale} -> ${newScale}), triggering redraw`,
      );

      // Ensure we're not already in the process of rendering
      if (!renderRequestedRef.current && editList) {
        renderRequestedRef.current = true;
        requestAnimationFrame(() => {
          renderEditAnnotations();
          renderRequestedRef.current = false;
        });
      }
    }
  }, [
    zoomContext?.zoomLevels[scoreId],
    renderEditAnnotations,
    scoreId,
    editList,
  ]);
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
  currentPage: number,
) {
  const lastEventTimeRef = useRef<number>(0);
  const MIN_EVENT_INTERVAL = 200; // Minimum 200ms between event handling

  useEffect(() => {
    const handlePageChange = (event: Event) => {
      const currentTime = Date.now();
      if (currentTime - lastEventTimeRef.current < MIN_EVENT_INTERVAL) return;
      lastEventTimeRef.current = currentTime;

      const customEvent = event as CustomEvent;
      const { currentPage: eventPage, scoreId: eventScoreId } =
        customEvent.detail;

      log.debug(
        `Received page change event for scoreId ${eventScoreId}, page ${eventPage}`,
      );
      if (eventScoreId === scoreId || eventScoreId === fileId) {
        log.debug(
          `Page change accepted for our score. Setting page to ${eventPage}`,
        );
        setCurrentPage(eventPage);

        // Force redraw after a short delay to ensure page has rendered
        setTimeout(() => {
          if (editList) {
            log.debug("Forcing redraw after page change");
            // Force redraw by removing and re-adding the editList
            const tempEditList = editList;
            setEditList(null);
            setTimeout(() => setEditList(tempEditList), 50);
          }
        }, 150);
      }
    };

    const handleRedrawAnnotations = (event: Event) => {
      const currentTime = Date.now();
      if (currentTime - lastEventTimeRef.current < MIN_EVENT_INTERVAL) return;
      lastEventTimeRef.current = currentTime;

      const customEvent = event as CustomEvent;
      const { scoreId: eventScoreId, currentPage: eventPage } =
        customEvent.detail;

      log.debug(
        `Received redraw annotations for scoreId ${eventScoreId}, page ${eventPage}`,
      );
      if ((eventScoreId === scoreId || eventScoreId === fileId) && editList) {
        log.debug(`Redraw accepted for our score with edits`);

        if (
          eventPage !== undefined &&
          Number(eventPage) !== Number(currentPage)
        ) {
          log.debug(
            `Setting current page to ${eventPage} (was ${currentPage})`,
          );
          setCurrentPage(eventPage);

          // Force redraw after a short delay to ensure page has rendered
          setTimeout(() => {
            log.debug("Forcing redraw after page change from redraw event");
            const tempEditList = editList;
            setEditList(null);
            setTimeout(() => setEditList(tempEditList), 50);
          }, 150);
        } else {
          log.debug(`Already on correct page ${currentPage}, forcing redraw`);
          const tempEditList = editList;
          setEditList(null);
          setTimeout(() => setEditList(tempEditList), 50);
        }
      }
    };

    log.debug(
      `Setting up page change and redraw event listeners for scoreId ${scoreId}`,
    );
    document.addEventListener("score:pageChange", handlePageChange);
    document.addEventListener(
      "score:redrawAnnotations",
      handleRedrawAnnotations,
    );

    return () => {
      document.removeEventListener("score:pageChange", handlePageChange);
      document.removeEventListener(
        "score:redrawAnnotations",
        handleRedrawAnnotations,
      );
    };
  }, [scoreId, fileId, editList, currentPage, setCurrentPage, setEditList]);
}
