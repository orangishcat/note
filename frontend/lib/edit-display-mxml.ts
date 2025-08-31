import { useCallback, useContext, useEffect, useRef } from "react";
import {
  Edit,
  EditOperation,
  Note,
  NoteList,
  ScoringResult,
} from "@/types/proto-types";
import { ZoomContext } from "@/app/providers";

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

export function useEditDisplayMusicXML(
  editList: ScoringResult | null,
  actualNotes: NoteList | null,
  scoreId: string,
  scoreFileId: string,
  setEditCount: (count: number) => void,
  enabled: boolean = true,
) {
  const containerRef = useRef<Element | null>(null);
  const zoomCtx = useContext(ZoomContext);
  const annotationsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    containerRef.current = document.querySelector(
      `#score-${scoreFileId} .score-container`,
    );
  }, [scoreFileId]);

  useEffect(() => {
    if (!enabled || !zoomCtx || annotationsRef.current.length === 0) return;
    const zoom = zoomCtx.getZoomLevel(scoreId) ?? 1;
    annotationsRef.current.forEach((annotation) => {
      if (annotation && annotation.style) {
        annotation.style.transform = `scale(${zoom})`;
        annotation.style.transformOrigin = "top left";
      }
    });
  }, [zoomCtx, zoomCtx?.zoomLevels[scoreId], scoreId]);

  const createAnnotDiv = (
    edit: Edit,
    note: Note,
    scale: number,
    offsetX: number,
    offsetY: number,
    color: string | null = null,
  ) => {
    const div = document.createElement("div");
    div.className = "note-rectangle cursor-pointer rounded-full absolute";
    const [x1, y1, x2, y2] = note.bbox;
    color = color ?? colorFor(edit.operation);
    Object.assign(div.style, {
      left: `${x1 * scale + offsetX}px`,
      top: `${y1 * scale + offsetY}px`,
      width: `${(x2 - x1) * scale}px`,
      height: `${(y2 - y1) * scale}px`,
      backgroundColor: color,
      border: `1px solid ${color.replace("0.5", "1")}`,
      transformOrigin: "top left",
    });
    return div;
  };

  const renderEdits = useCallback(() => {
    if (!enabled) return;
    const container = containerRef.current as HTMLElement | null;
    if (!editList || !container) return;

    // Find OSMD root SVG within this score container wrapper
    const wrapper = container.parentElement as HTMLElement | null;
    if (!wrapper) return;
    const svg = wrapper.querySelector("svg") as SVGSVGElement | null;
    if (!svg) return;

    const vb = svg.getAttribute("viewBox") || "0 0 0 0";
    const vbParts = vb.split(/\s+/).map((v) => parseFloat(v));
    const viewWidth = vbParts[2] || svg.clientWidth || 1;
    const viewHeight = vbParts[3] || svg.clientHeight || 1;

    const svgRect = svg.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offsetX = svgRect.left - containerRect.left;
    const offsetY = svgRect.top - containerRect.top;
    const scaleX = svgRect.width / viewWidth;
    const scaleY = svgRect.height / viewHeight;
    const scale = Math.min(scaleX, scaleY);

    // Clear existing annotations
    container.querySelectorAll(".note-rectangle").forEach((e) => e.remove());
    annotationsRef.current = [];

    const edits = editList.edits ?? [];
    setEditCount(edits.length);

    edits.forEach((edit: Edit) => {
      const div = createAnnotDiv(edit, edit.sChar, scale, offsetX, offsetY);
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
        const tgt = createAnnotDiv(
          edit,
          edit.tChar,
          scale,
          offsetX,
          offsetY,
          "rgb(31,151,176)",
        );
        container.appendChild(tgt);
        annotationsRef.current.push(tgt);
      }
    });

    return () => {
      container.querySelectorAll(".note-rectangle").forEach((e) => e.remove());
      annotationsRef.current = [];
    };
  }, [editList, scoreFileId, setEditCount, enabled]);

  useEffect(() => {
    if (!enabled) return;
    renderEdits();
  }, [renderEdits, enabled]);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    document.addEventListener("score:redrawAnnotations", renderEdits);
    return () => {
      document.removeEventListener("score:redrawAnnotations", renderEdits);
    };
  }, [renderEdits, enabled]);
}
