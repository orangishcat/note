import { useCallback, useContext, useEffect, useRef } from "react";
import {
  Edit,
  EditOperation,
  Note,
  NoteList,
  ScoringResult,
  TempoSection,
  Line,
} from "@/types/proto-types";
import log from "loglevel";
import { ZoomContext } from "@/app/providers";

export function midiPitchToNoteName(midiPitch: number): string {
  if (midiPitch === undefined || midiPitch === null) return "";
  const names = [
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
  return `${names[midiPitch % 12]}${octave}`;
}

function colorFor(op: EditOperation): string {
  switch (op) {
    case EditOperation.INSERT:
      return "rgba(0,255,0,0.5)";
    case EditOperation.DELETE:
      return "rgba(255,0,0,0.5)";
    case EditOperation.SUBSTITUTE:
      return "rgba(255,165,0,0.5)";
    default:
      return "rgba(0,0,0,0.5)";
  }
}

export function useEditDisplay(
  editList: ScoringResult | null,
  actualNotes: NoteList | null,
  currentPage: number,
  scoreId: string,
  scoreFileId: string,
  setEditCount: (count: number) => void,
) {
  const containerRef = useRef<Element | null>(null);
  const zoomCtx = useContext(ZoomContext);
  const annotationsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    containerRef.current = document.querySelector(
      `#score-${scoreFileId} .score-container`,
    );
  }, [scoreFileId]);

  // Separate effect for handling zoom changes on existing annotations
  useEffect(() => {
    if (!zoomCtx || annotationsRef.current.length === 0) return;

    const zoom = zoomCtx.getZoomLevel(scoreId) ?? 1;

    // Apply zoom transform to existing annotations without recreating them
    annotationsRef.current.forEach((annotation) => {
      if (annotation && annotation.style) {
        annotation.style.transform = `scale(${zoom})`;
        annotation.style.transformOrigin = "top left";
      }
    });
  }, [zoomCtx, zoomCtx?.zoomLevels[scoreId], scoreId]);

  function createAnnotDiv(
    edit: Edit,
    note: Note,
    pageScale: number,
    pageZoom: number,
    offsetX: number,
    offsetY: number,
    color: string | null = null,
  ) {
    const div = document.createElement("div");
    div.className = "note-rectangle cursor-pointer rounded-full absolute";

    const [x1, y1, x2, y2] = note.bbox;

    // Scale coordinates with base scale only
    const scaledX1 = x1 * pageScale + offsetX;
    const scaledY1 = y1 * pageScale + offsetY;
    const scaledX2 = x2 * pageScale + offsetX;
    const scaledY2 = y2 * pageScale + offsetY;

    color = color ?? colorFor(edit.operation);

    Object.assign(div.style, {
      left: `${scaledX1}px`,
      top: `${scaledY1}px`,
      width: `${scaledX2 - scaledX1}px`,
      height: `${scaledY2 - scaledY1}px`,
      backgroundColor: color,
      border: `1px solid ${color.replace("0.5", "1")}`,
      transform: `scale(${pageZoom})`,
      transformOrigin: "top left",
    });

    div.addEventListener("click", (e) => {
      e.stopPropagation();
      const ev = new CustomEvent("edit:showComparison", {
        detail: {
          note: edit.sChar,
          targetNote: edit.tChar,
          editOperation: EditOperation[edit.operation],
          isTarget: false,
          position: edit.pos,
        },
        bubbles: true,
      });
      document.dispatchEvent(ev);
    });
    return div;
  }

  const createTempoBrackets = useCallback(
    (
      section: TempoSection,
      pageScale: number,
      pageZoom: number,
      offsetX: number,
      offsetY: number,
    ): HTMLElement[] => {
      if (!editList || !actualNotes) return [];
      const startNote = actualNotes.notes[section.startIndex];
      const endNote = actualNotes.notes[section.endIndex];

      if (!startNote || !endNote) {
        log.warn("No start or end note for tempo section", section);
        return [];
      }

      // Find the line nearest to the starting note
      const noteCenterY = (startNote.bbox[1] + startNote.bbox[3]) / 2;
      let nearest: Line | null = null;
      let minDist = Number.POSITIVE_INFINITY;
      for (const line of actualNotes.lines as Line[]) {
        const lineCenterY = (line.bbox[1] + line.bbox[3]) / 2;
        const dist = Math.abs(noteCenterY - lineCenterY);
        if (dist < minDist) {
          nearest = line;
          minDist = dist;
        }
      }

      log.debug("Nearest:", nearest);
      if (!nearest) return [];

      const lineTop = nearest.bbox[1] * pageScale + offsetY;
      const lineBottom = nearest.bbox[3] * pageScale + offsetY;
      const bracketTop = lineTop - 15;
      const bracketHeight = lineBottom - lineTop + 30;

      const startX = startNote.bbox[0] * pageScale + offsetX - 10;
      const endX = endNote.bbox[2] * pageScale + offsetX + 30;

      function createBracket(x: number, isStart: boolean) {
        const bracket = document.createElement("div");
        bracket.className = "tempo-bracket absolute";
        Object.assign(bracket.style, {
          left: `${x}px`,
          top: `${bracketTop}px`,
          width: "10px",
          height: `${bracketHeight}px`,
          transform: `scale(${pageZoom})`,
          transformOrigin: "top left",
        });

        const thickness = 1;

        const vert = document.createElement("div");
        Object.assign(vert.style, {
          position: "absolute",
          top: "0",
          bottom: "0",
          width: `${thickness}px`,
          backgroundColor: "black",
          [isStart ? "left" : "right"]: "0",
        });

        const topH = document.createElement("div");
        Object.assign(topH.style, {
          position: "absolute",
          width: "10px",
          height: `${thickness}px`,
          backgroundColor: "black",
          top: "0",
          [isStart ? "left" : "right"]: "0",
        });

        const bottomH = document.createElement("div");
        Object.assign(bottomH.style, {
          position: "absolute",
          width: "10px",
          height: `${thickness}px`,
          backgroundColor: "black",
          bottom: "0",
          [isStart ? "left" : "right"]: "0",
        });

        bracket.appendChild(vert);
        bracket.appendChild(topH);
        bracket.appendChild(bottomH);

        return bracket;
      }

      return [createBracket(startX, true), createBracket(endX, false)];
    },
    [actualNotes, editList],
  );

  const renderEdits = useCallback(() => {
    log.debug("Rendering annotations for page", currentPage);
    const container = containerRef.current;
    if (!editList || !container) return;
    const pageSizes = editList.size;
    if (!Array.isArray(pageSizes)) return;

    log.debug("Edit list:", editList);
    log.debug("Actual notes:", actualNotes);

    const rect = container.getBoundingClientRect();
    const containerWidth = rect.width;
    const containerHeight = rect.height;
    const pageIndex = pageSizes.length === 2 ? 0 : currentPage;
    const pageWidth = pageSizes[pageIndex * 2];
    const pageHeight = pageSizes[pageIndex * 2 + 1];
    const scale = Math.min(
      containerWidth / pageWidth,
      containerHeight / pageHeight,
    );
    const offsetX = (containerWidth - pageWidth * scale) / 2;
    const offsetY = (containerHeight - pageHeight * scale) / 2;

    // Clear existing annotations and reset the ref
    container.querySelectorAll(".note-rectangle").forEach((e) => e.remove());
    annotationsRef.current = [];

    const edits =
      editList.edits?.filter((e) => e.sChar?.page === currentPage) ?? [];
    setEditCount(edits.length);

    if (!zoomCtx) return;
    // const currentZoom = zoomCtx.getZoomLevel(scoreId) ?? 1;
    const currentZoom = 1;

    edits.forEach((edit: Edit) => {
      if (edit.sChar.page !== currentPage) return;

      const div = createAnnotDiv(
        edit,
        edit.sChar,
        scale,
        currentZoom,
        offsetX,
        offsetY,
      );
      container.appendChild(div);
      annotationsRef.current.push(div);

      if (edit.operation === EditOperation.SUBSTITUTE) {
        if (!edit.tChar.bbox) {
          const sizeY = edit.sChar.bbox[3] - edit.sChar.bbox[1];
          const offset = ((edit.sChar.pitch - edit.tChar.pitch) * sizeY) / 2;
          edit.tChar.bbox = Array.of(...edit.sChar.bbox);
          edit.tChar.bbox[1] = edit.sChar.bbox[1] + offset;
          edit.tChar.bbox[3] = edit.sChar.bbox[3] + offset;
        }

        const targetDiv = createAnnotDiv(
          edit,
          edit.tChar,
          scale,
          currentZoom,
          offsetX,
          offsetY,
          "rgb(31,151,176)",
        );
        container.appendChild(targetDiv);
        annotationsRef.current.push(targetDiv);
      }
    });

    if (!actualNotes) {
      log.warn("played note is empty:", actualNotes);
    } else {
      editList.tempoSections.forEach((section) => {
        const brackets = createTempoBrackets(
          section,
          scale,
          currentZoom,
          offsetX,
          offsetY,
        );
        brackets.forEach((div) => {
          container.appendChild(div);
          annotationsRef.current.push(div);
        });
      });
    }

    return () => {
      container.querySelectorAll(".note-rectangle").forEach((e) => e.remove());
      annotationsRef.current = [];
    };
  }, [
    actualNotes,
    currentPage,
    editList,
    setEditCount,
    zoomCtx,
    createTempoBrackets,
  ]);

  // Trigger render when dependencies change
  useEffect(() => {
    renderEdits();
  }, [renderEdits]);

  // Listen for redraw events
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.addEventListener("score:redrawAnnotations", renderEdits);
    return () => {
      document.removeEventListener("score:redrawAnnotations", renderEdits);
    };
  }, [renderEdits]);
}
