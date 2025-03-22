import React, {RefObject, useCallback, useEffect, useRef} from 'react';
import {GraphicalNote, IOSMDOptions, OpenSheetMusicDisplay} from "opensheetmusicdisplay";
import ZoomableDiv from "@/components/ui-custom/zoomable-div";
import {useQuery} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";

export interface MusicScore {
  id: string;
  title: string;
  subtitle: string;
  upload_date: string;
  file_id?: string;
  preview_id?: string;
  starred?: boolean;
  folder?: string;
}

interface MusicXMLRendererProps {
  scoreFileID: string;
  recenter: RefObject<HTMLButtonElement>;
}

const debug = !!localStorage.getItem("debug")

export default function MusicXMLRenderer({scoreFileID, recenter}: MusicXMLRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);

  // Update the visible pages by toggling the display of each backend's element.
  const updateVisiblePages = () => {
    const container = containerRef.current;
    if (!container || !osmdRef.current) return;
    const containerRect = container.getBoundingClientRect();
    const backends = osmdRef.current.Drawer.Backends;
    if (!backends || backends.length === 0) return;
    for (const backend of backends) {
      // Use the backend's public API to get the rendered SVG element.
      const element = backend.getRenderElement();
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      // If the page's SVG is entirely above or below the visible area, hide it.
      if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
        element.style.display = "none";
      } else {
        element.style.display = "";
      }
    }
  };

  const clearDebugText = () => {
    document.querySelectorAll(".note-pitch-text").forEach(el => el.remove())
  }

  function forEachNote(func: (note: GraphicalNote) => void) {
    if (!osmdRef.current) return;
    osmdRef.current.GraphicSheet.MeasureList.forEach(measureRow =>
      measureRow.forEach(measure =>
        measure.staffEntries.forEach(staffEntry =>
          staffEntry.graphicalVoiceEntries.forEach(voiceEntry => voiceEntry.notes.forEach(func)))
      )
    )
  }

  // This function draws a red rectangle around every notehead.
  const drawDebugText = () => {
    const svg = document.querySelector("#osmdSvgPage1");
    if (!svg) return;
    let i = 1;
    forEachNote(note => {
      const bbox = note.PositionAndShape;
      const s = (i++) + ": " + note.graphicalNoteLength.toString() + " " +
        // @ts-expect-error protected elements access
        (note.sourceNote.pitch ? note.sourceNote.pitch.ToStringShortGet : "null")
      const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const pos = bbox.AbsolutePosition;
      textEl.setAttribute("x", (pos.x * 10 - 50).toString());
      textEl.setAttribute("y", (pos.y * 10).toString());
      textEl.setAttribute("fill", "purple");
      textEl.setAttribute("font-size", "11");
      textEl.setAttribute("class", "note-pitch-text");
      textEl.textContent = s;
      svg.appendChild(textEl);
    })
  };

  const {data: musicXMLBase64} = useQuery({
    queryKey: ['musicXMLBase64', scoreFileID],
    queryFn: async () =>
      await fetch(`/api/score/as-base64/${scoreFileID}`).then(res => res.text())
  });

  const fetchAndRender = useCallback(async () => {
    if (!containerRef.current || !musicXMLBase64) return;
    try {
      if (!osmdRef.current) {
        const options: IOSMDOptions = {
          backend: "svg",
          drawTitle: true,
          autoResize: true,
        };
        osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, options);
      }
      await osmdRef.current.load(atob(musicXMLBase64), "Score");
      osmdRef.current.render();
      updateVisiblePages();
    } catch (error) {
      console.error("Error processing MusicXML file:", error);
    }
    // eslint-disable-next-line
  }, [musicXMLBase64])

  useEffect(() => {
    if (!containerRef.current || !musicXMLBase64) return;
    const start = performance.now();
    fetchAndRender().then(() => {
      console.log(`Rendering took ${performance.now() - start}ms`)
    });
  }, [fetchAndRender, musicXMLBase64]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = updateVisiblePages
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="overflow-hidden flex flex-col place-items-center" style={{height: "calc(100vh - 11rem)"}}>
      <ZoomableDiv recenter={recenter}>
        <div
          ref={containerRef}
          className="border flex flex-col justify-center place-items-center p-2 bg-white"
          // Use CSS min() to ensure the container width doesn't exceed the screen width (minus 6px)
          style={{width: "min(70rem, calc(100vw - 6px))"}}
        ></div>
      </ZoomableDiv>
      {debug && <div className="fixed top-[100px] right-[100px] bg-gray-700 flex gap-4 p-4 rounded-2xl">
        <Button onClick={fetchAndRender}>Rerender</Button>
        <Button onClick={drawDebugText}>Draw debug text</Button>
        <Button onClick={clearDebugText}>Clear debug text</Button>
      </div>}
    </div>
  );
}
