"use client";
import React, {RefObject, useEffect, useRef} from "react";
import {IOSMDOptions, OpenSheetMusicDisplay} from "opensheetmusicdisplay";
import ZoomableDiv from "@/components/ui-custom/zoomable-div";

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

  useEffect(() => {
    if (!containerRef.current) return;

    async function fetchAndRender() {
      const musicXMLBase64 = await fetch(`/api/score/as-base64/${scoreFileID}`).then(res => res.text());
      if (!containerRef.current || !musicXMLBase64) return;
      try {
        if (!osmdRef.current) {
          const options: IOSMDOptions = {
            backend: "svg",
            drawTitle: true,
            autoResize: false,
          };
          osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, options);
        }
        await osmdRef.current.load(atob(musicXMLBase64), "Score");
        osmdRef.current.render();
        updateVisiblePages();
      } catch (error) {
        console.error("Error processing MusicXML file:", error);
      }
    }

    const start = performance.now();
    fetchAndRender().then(() => console.log(`Rendering took ${performance.now() - start}ms`))
  }, [scoreFileID]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      updateVisiblePages();
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="overflow-hidden flex flex-col place-items-center" style={{height: "calc(100vh - 11rem)"}}>
      <ZoomableDiv recenter={recenter}>
        <div
          ref={containerRef}
          className="border flex flex-col justify-center place-items-center p-2 bg-white"
          style={{width: "70rem"}}
        ></div>
      </ZoomableDiv>
    </div>
  );
}
