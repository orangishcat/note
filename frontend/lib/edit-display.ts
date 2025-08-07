import { useContext, useEffect, useRef } from "react";
import {
  Edit,
  EditOperation,
  Note,
  NoteList,
  ScoringResult,
  TempoSection,
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

  // Separate effect for rendering edits (without zoomCtx dependency)
  useEffect(renderEdits, [
    editList,
    currentPage,
    scoreId,
    scoreFileId,
    setEditCount,
  ]);

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

    log.debug({
      scaledX1,
      scaledY1,
      scaledX2,
      scaledY2,
    });

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

  function createTempoDiv(section: TempoSection) {
    if (!editList || !actualNotes) return;
    const startNote = actualNotes.notes[section.startIndex],
      endNote = actualNotes.notes[section.endIndex];
    if (!startNote || !endNote) {
      log.warn("No start or end note for tempo section", section);
      return;
    }
    const div = document.createElement("div");
    div.className = "tempo-rectangle cursor-pointer rounded-full absolute";
    Object.assign(div.style, {
      left: `${startNote.bbox[0]}px`,
      top: `${startNote.bbox[1]}px`,
      width: `${endNote.bbox[2] - startNote.bbox[0]}px`,
      height: `${startNote.bbox[3] - startNote.bbox[1]}px`,
      backgroundColor: "rgba(0,0,0,0.1)",
      border: "1px solid rgba(0,0,0,0.5)",
    });
    return div;
  }

  function renderEdits() {
    log.debug("Rendering edits for page", currentPage);
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
        const div = createTempoDiv(section);
        if (!div) return;
        container.appendChild(div);
        annotationsRef.current.push(div);
      });
    }

    return () => {
      container.querySelectorAll(".note-rectangle").forEach((e) => e.remove());
      annotationsRef.current = [];
    };
  }

  if (typeof document !== "undefined")
    document.addEventListener("score:redrawAnnotations", renderEdits);
  return () =>
    document.removeEventListener("score:redrawAnnotations", renderEdits);
}
