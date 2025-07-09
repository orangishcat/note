import { useContext, useEffect, useRef } from "react";
import { ScoringResult, Edit, EditOperation } from "@/types/proto-types";
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
  }, [zoomCtx?.zoomLevels[scoreId], scoreId]);

  function renderEdits() {
    log.debug("Rendering edits for page", currentPage);
    const container = containerRef.current;
    if (!editList || !container) return;
    const pageSizes = editList.size;
    if (!Array.isArray(pageSizes)) return;

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

    const currentZoom = 1;

    edits.forEach((edit: Edit) => {
      if (edit.sChar.page !== currentPage) return;

      const note = edit.sChar;
      const div = document.createElement("div");
      div.className = "note-rectangle cursor-pointer rounded-full absolute";

      const [x1, y1, x2, y2] = note.bbox;

      // Scale coordinates with base scale only
      const scaledX1 = x1 * scale + offsetX;
      const scaledY1 = y1 * scale + offsetY;
      const scaledX2 = x2 * scale + offsetX;
      const scaledY2 = y2 * scale + offsetY;

      Object.assign(div.style, {
        left: `${scaledX1}px`,
        top: `${scaledY1}px`,
        width: `${scaledX2 - scaledX1}px`,
        height: `${scaledY2 - scaledY1}px`,
        backgroundColor: colorFor(edit.operation),
        border: `1px solid ${colorFor(edit.operation).replace("0.5", "1")}`,
        transform: `scale(${currentZoom})`,
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

      container.appendChild(div);
      annotationsRef.current.push(div);
    });

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
