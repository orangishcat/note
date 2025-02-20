"use client";
import {useEffect, useRef} from "react";
import {IOSMDOptions, OpenSheetMusicDisplay} from "opensheetmusicdisplay";
import ZoomableDiv from "@/components/ui-custom/zoomable-div";

export interface MusicScore {
  id: string
  title: string
  subtitle: string
  upload_date: string
  file_id?: string
  content?: string
  starred?: boolean
  folder?: string
}

interface MusicXMLRendererProps {
  musicXMLBase64: string;
}

// Helper function to convert a base64 encoded string to an ArrayBuffer.
export default function MusicXMLRenderer({musicXMLBase64}: MusicXMLRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);

  useEffect(() => {
    async function fetchAndRender() {
      if (!containerRef.current || !musicXMLBase64) return;
      try {
        // Convert the base64 string to an ArrayBuffer.
        // const arrayBuffer = base64ToArrayBuffer(musicXMLBase64);

        // Initialize OSMD if not already done.
        if (!osmdRef.current) {
          const options: IOSMDOptions = {
            backend: "svg",
            drawTitle: true,
            autoResize: false,
          };
          osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, options);
        }

        // Load and render the MusicXML content.
        await osmdRef.current.load(atob(musicXMLBase64), "temporary title");
        osmdRef.current.render();

        // Draw overlay rectangles around note bounding boxes.
        drawRectanglesAroundNotes(osmdRef.current);
      } catch (error) {
        console.error("Error processing MusicXML file:", error);
      }
    }

    fetchAndRender().then();
  }, [musicXMLBase64]);

  function drawRectanglesAroundNotes(osmd: OpenSheetMusicDisplay) {
    // Access the graphic sheet and its measure list.
    const graphicSheet = osmd.GraphicSheet;
    const measureList = graphicSheet.MeasureList;
    if (!measureList) return;

    measureList.forEach((measureArray) => {
      measureArray.forEach((measure) => {
        measure.staffEntries.forEach((staffEntry) => {
          staffEntry.graphicalVoiceEntries.forEach((voiceEntry) => {
            voiceEntry.notes.forEach((note) => {
              // @ts-expect-error protected access
              const bbox = note.boundingBox;
              if (!bbox) return;
              // @ts-expect-error protected access
              const absPos = bbox.absolutePosition;
              // Create a rectangle object with x, y, width, and height.
              const rectangle = {
                x: absPos.x,
                y: absPos.y,
                // @ts-expect-error protected access
                width: bbox.size.width, height: bbox.size.height,
              };
              // @ts-expect-error protected access
              osmd.Drawer.renderRectangle(rectangle, 1, 0, "#FF0000", 0.3);
            });
          });
        });
      });
    });
  }

  return (
    <div className="overflow-y-auto" style={{height: "calc(100vh - 11rem)"}}>
      <ZoomableDiv>
        <div ref={containerRef}
             className="border flex flex-col justify-center place-items-center p-2 bg-white"
             style={{width: "70rem"}}></div>
      </ZoomableDiv>
    </div>
  );
}
