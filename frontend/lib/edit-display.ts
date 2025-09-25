import { useCallback, useEffect, useRef } from "react";
import {
  Edit,
  EditOperation,
  Line,
  Note,
  NoteList,
  ScoringResult,
  TempoSection,
} from "@/types/proto-types";
import log from "loglevel";

function colorFor(op: EditOperation, second: boolean = false): string {
  switch (op) {
    case EditOperation.INSERT:
      return "rgba(0,255,0,0.5)";
    case EditOperation.DELETE:
      return "rgba(255,0,0,0.5)";
    case EditOperation.SUBSTITUTE:
      return second ? "rgba(255,165,0,0.5)" : "rgba(0,165,255,0.5)";
    default:
      return "rgba(0,0,0,0.5)";
  }
}

export function useEditDisplay(
  editList: ScoringResult | null,
  scoreNotes: NoteList | null,
  scoreFileId: string,
  enabled: boolean = true,
  canvasWrappers: HTMLDivElement[] | null = null,
  minConfidence: number = 1,
) {
  const containerRef = useRef<Element | null>(null);
  const annotationsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    containerRef.current = document.querySelector(
      `#score-${scoreFileId} .score-container`,
    );
  }, [scoreFileId]);

  function createAnnotDiv(
    edit: Edit,
    note: Note,
    scaleX: number,
    scaleY: number,
    color: string | null = null,
    isTarget = false,
  ) {
    const div = document.createElement("div");
    div.className = "note-rectangle cursor-pointer rounded-full absolute";
    div.addEventListener("click", () => log.debug("Edit clicked:", edit));

    const [x1, y1, x2, y2] = note.bbox;

    // Scale coordinates relative to canvas size with per-axis scaling
    const scaledX1 = x1 * scaleX;
    const scaledY1 = y1 * scaleY;
    const scaledX2 = x2 * scaleX;
    const scaledY2 = y2 * scaleY;

    color = color ?? colorFor(edit.operation);

    Object.assign(div.style, {
      left: `${scaledX1}px`,
      top: `${scaledY1}px`,
      width: `${scaledX2 - scaledX1}px`,
      height: `${scaledY2 - scaledY1}px`,
      backgroundColor: color,
      border: `1px solid ${color.replace("0.5", "1")}`,
      transformOrigin: "top left",
      pointerEvents: "auto",
    });

    div.addEventListener("click", (e) => {
      e.stopPropagation();
      const ev = new CustomEvent("edit:showComparison", {
        detail: {
          note,
          targetNote: isTarget ? edit.sChar : edit.tChar,
          editOperation: EditOperation[edit.operation],
          isTarget,
          position: edit.pos,
        },
        bubbles: true,
      });
      document.dispatchEvent(ev);
    });
    return div;
  }

  const createTempoBrackets = useCallback(
    (section: TempoSection, scaleX: number, scaleY: number): HTMLElement[] => {
      if (!editList || !scoreNotes) return [];
      const startNote = scoreNotes.notes[section.startIndex];
      const endNote = scoreNotes.notes[section.endIndex];

      if (!startNote || !endNote) {
        log.warn("No start or end note for tempo section", section);
        return [];
      }

      // Find the line nearest to the starting note
      const noteCenterY = (startNote.bbox[1] + startNote.bbox[3]) / 2;
      let nearest: Line | null = null;
      let minDist = Number.POSITIVE_INFINITY;
      for (const line of scoreNotes.lines as Line[]) {
        const lineCenterY = (line.bbox[1] + line.bbox[3]) / 2;
        const dist = Math.abs(noteCenterY - lineCenterY);
        if (dist < minDist) {
          nearest = line;
          minDist = dist;
        }
      }

      if (!nearest) {
        log.warn("No nearest line for tempo section", section);
        return [];
      }

      const lineTop = nearest.bbox[1] * scaleY;
      const lineBottom = nearest.bbox[3] * scaleY;
      const bracketTop = lineTop - 15;
      const bracketHeight = lineBottom - lineTop + 30;

      const startX = startNote.bbox[0] * scaleX - 10;
      const endX = endNote.bbox[2] * scaleX + 30;

      function createBracket(x: number, isStart: boolean) {
        const bracket = document.createElement("div");
        bracket.className = "tempo-bracket absolute";
        Object.assign(bracket.style, {
          left: `${x}px`,
          top: `${bracketTop}px`,
          width: "10px",
          height: `${bracketHeight}px`,
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
    [scoreNotes, editList],
  );

  const renderEdits = useCallback(() => {
    if (!enabled) return;
    log.trace("Rendering annotations for all pages");

    log.debug("Edit list:", editList);
    log.debug("Actual notes:", scoreNotes);

    const container = containerRef.current;
    if (!editList || !container) {
      log.warn("No edit list or container for annotations");
      return;
    }
    if (!scoreNotes) {
      log.warn("No score notes for annotations");
      return;
    }
    const pageSizes = scoreNotes.size;
    if (!Array.isArray(pageSizes)) {
      log.warn("No page sizes in edit list:", pageSizes);
      return;
    }

    const hostWrappers =
      canvasWrappers && canvasWrappers.length > 0
        ? canvasWrappers
        : Array.from(
            container.querySelectorAll<HTMLElement>(".canvasWrapper"),
          ).filter(
            (node): node is HTMLDivElement => node instanceof HTMLDivElement,
          );

    log.debug("Canvas wrappers:", hostWrappers);

    (container as HTMLElement)
      .querySelectorAll(
        ".edit-overlay .note-rectangle, .edit-overlay .tempo-bracket",
      )
      .forEach((e) => e.remove());
    annotationsRef.current = [];

    hostWrappers.forEach((host, pageIndex) => {
      // if page size length == 2, set all page sizes to first page
      const pageMetaIndex = pageSizes.length > 2 ? pageIndex : 0;
      const pageWidth = pageSizes[pageMetaIndex * 2];
      const pageHeight = pageSizes[pageMetaIndex * 2 + 1];
      if (!pageWidth || !pageHeight) {
        log.warn("No page size for page", pageIndex);
        return;
      }

      const canvas = host.querySelector("canvas") as HTMLCanvasElement | null;
      const hostWidth = canvas?.clientWidth ?? host.clientWidth;
      const hostHeight = canvas?.clientHeight ?? host.clientHeight;
      if (!hostWidth || !hostHeight) {
        log.warn("No host width/height for page", pageIndex, canvas);
        return;
      }

      const scaleX = hostWidth / pageWidth;
      const scaleY = hostHeight / pageHeight;

      // Ensure an overlay layer within the host
      let overlay = host.querySelector(".edit-overlay") as HTMLElement | null;
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "edit-overlay";
        Object.assign(overlay.style, {
          position: "absolute",
          inset: "0",
          pointerEvents: "none",
          zIndex: 1000,
        });
        host.appendChild(overlay);
      }

      overlay
        .querySelectorAll(".note-rectangle, .tempo-bracket")
        .forEach((e) => e.remove());

      const pageEdits = (editList.edits ?? []).filter(
        (edit) =>
          edit.sChar.page === pageIndex &&
          edit.sChar.confidence >= minConfidence &&
          (edit.tChar?.confidence ?? 5) >= minConfidence,
      );

      if (pageEdits.length === 0) {
        log.debug("No edits for page", pageIndex);
        return;
      }

      pageEdits.forEach((edit: Edit) => {
        const sDiv = createAnnotDiv(
          edit,
          edit.sChar,
          scaleX,
          scaleY,
          colorFor(edit.operation),
        );
        sDiv.style.zIndex = "1001";
        overlay!.appendChild(sDiv);
        annotationsRef.current.push(sDiv);
        if (edit.tChar) {
          if (!edit.tChar.bbox) {
            edit.tChar.bbox = [0, 0, 0, 0];
            const sY = edit.sChar.bbox[3] - edit.sChar.bbox[1];
            const diff = (edit.tChar.pitch - edit.sChar.pitch) / 2;
            log.debug(edit.sChar.bbox, sY, diff);
            edit.tChar.bbox[0] = edit.sChar.bbox[0];
            edit.tChar.bbox[1] = edit.sChar.bbox[1] + sY * diff;
            edit.tChar.bbox[2] = edit.sChar.bbox[2];
            edit.tChar.bbox[3] = edit.sChar.bbox[3] + sY * diff;
          }
          const tDiv = createAnnotDiv(
            edit,
            edit.tChar,
            scaleX,
            scaleY,
            colorFor(edit.operation, true),
          );
          tDiv.style.zIndex = "1001";
          overlay!.appendChild(tDiv);
          annotationsRef.current.push(tDiv);
        }
      });

      // Render tempo brackets that belong to this page
      if (scoreNotes) {
        editList.tempoSections.forEach((section) => {
          const startNote = scoreNotes.notes[section.startIndex];
          if (!startNote || startNote.page !== pageIndex) return;
          const brackets = createTempoBrackets(section, scaleX, scaleY);
          brackets.forEach((div) => {
            div.style.pointerEvents = "none";
            div.style.zIndex = "1001";
            overlay!.appendChild(div);
            annotationsRef.current.push(div);
          });
        });
      }
    });

    return () => {
      (container as HTMLElement)
        .querySelectorAll(
          ".edit-overlay .note-rectangle, .edit-overlay .tempo-bracket",
        )
        .forEach((e) => e.remove());
      annotationsRef.current = [];
    };
  }, [scoreNotes, editList, createTempoBrackets, enabled, canvasWrappers]);

  // Listen for redraw events
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as
        | { scoreId?: string | null }
        | undefined;
      if (detail?.scoreId && detail.scoreId !== scoreFileId) {
        log.trace(
          "Skipping redraw for score",
          detail.scoreId,
          "because we are",
          scoreFileId,
        );
        return;
      }
      renderEdits();
    };
    document.addEventListener("score:redrawAnnotations", handler);
    return () => {
      document.removeEventListener("score:redrawAnnotations", handler);
    };
  }, [renderEdits, enabled, scoreFileId]);
}
