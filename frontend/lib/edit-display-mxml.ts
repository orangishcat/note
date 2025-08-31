import { useCallback, useContext, useEffect, useRef } from "react";
import {
  Edit,
  EditOperation,
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

  const createAnnotDivPixels = (
    color: string,
    left: number,
    top: number,
    width: number,
    height: number,
  ) => {
    const div = document.createElement("div");
    div.className = "note-rectangle cursor-pointer rounded-full absolute";
    Object.assign(div.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundColor: color,
      border: `1px solid ${color.replace("0.5", "1")}`,
      transformOrigin: "top left",
    });
    return div;
  };

  function collectRenderedNotes(osmd: any) {
    const hits: any[] = [];
    if (!osmd || !osmd.GraphicSheet) return hits;
    const zoom = osmd.Zoom || 1;
    const osmdUnitToPx = 10 * zoom; // approx conversion per OSMD docs
    const measureList =
      osmd.graphic?.measureList || osmd.GraphicSheet?.measureList;
    if (!Array.isArray(measureList)) return hits;
    for (let measIdx = 0; measIdx < measureList.length; measIdx++) {
      const measuresForStaves = measureList[measIdx];
      for (const gMeasure of measuresForStaves || []) {
        const staffIndex = gMeasure?.ParentStaff?.Id ?? 0;
        for (const gse of gMeasure?.staffEntries || []) {
          for (const gve of gse?.graphicalVoiceEntries || []) {
            for (const gNote of gve?.notes || []) {
              const abs = gNote?.PositionAndShape?.AbsolutePosition;
              if (!abs) continue;
              const absX = abs.x ?? 0;
              const absY = abs.y ?? 0;
              const pxX = absX * osmdUnitToPx;
              const pxY = absY * osmdUnitToPx;
              const note = gNote.sourceNote;
              const pitch = note?.TransposedPitch ?? note?.Pitch;
              const midi =
                pitch && typeof pitch.getHalfTone === "function"
                  ? pitch.getHalfTone()
                  : note?.halfTone ?? 60;
              const pitchText =
                pitch && typeof pitch.ToStringShort === "function"
                  ? pitch.ToStringShort()
                  : note?.ToStringShortGet ?? "";
              hits.push({
                pageIndex: 0,
                staffIndex,
                measureIndex: measIdx,
                absX,
                absY,
                pxX,
                pxY,
                midi,
                pitchText,
              });
            }
          }
        }
      }
    }
    return hits;
  }

  const renderEdits = useCallback(() => {
    if (!enabled) return;
    const container = containerRef.current as HTMLElement | null;
    if (!editList || !container) return;

    // Pull OSMD instance registered by the renderer
    const osmd = (window as any).__osmdInstances?.[scoreFileId];
    if (!osmd) return;
    const containerRect = container.getBoundingClientRect();

    // Clear existing annotations
    container.querySelectorAll(".note-rectangle").forEach((e) => e.remove());
    annotationsRef.current = [];

    const edits = editList.edits ?? [];
    setEditCount(edits.length);

    // Collect rendered notes from OSMD internals (no DOM querying)
    const hits = collectRenderedNotes(osmd);
    edits.forEach((edit: Edit) => {
      // Try mapping by sequence index; fallback by closest MIDI
      let idx = Math.max(0, Math.min(edit.pos ?? 0, hits.length - 1));
      if (!hits[idx]) {
        let best = -1;
        let bestDiff = 1e9;
        for (let i = 0; i < hits.length; i++) {
          const d = Math.abs((edit.sChar?.pitch ?? 60) - (hits[i].midi ?? 60));
          if (d < bestDiff) {
            best = i;
            bestDiff = d;
          }
        }
        idx = best >= 0 ? best : 0;
      }
      const hit = hits[idx];
      const left = hit.pxX - containerRect.left;
      const top = hit.pxY - containerRect.top;
      const width = 12 * (osmd.Zoom || 1);
      const height = 12 * (osmd.Zoom || 1);
      const color = colorFor(edit.operation);
      const div = createAnnotDivPixels(color, left, top, width, height);
      container.appendChild(div);
      annotationsRef.current.push(div);
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
