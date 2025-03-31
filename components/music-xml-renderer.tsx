import React, { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { GraphicalNote, IOSMDOptions, OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import ZoomableDiv from "@/components/ui-custom/zoomable-div";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {cn} from "@/lib/utils";

export interface MusicScore {
    id: string;
    title: string;
    subtitle: string;
    upload_date: string;
    total_pages: number;
    is_mxl?: boolean;
    file_id?: string;
    notes_id?: string
    preview_id?: string;
    starred?: boolean;
    folder?: string;
}

export interface MusicXMLRendererProps {
    scoreId: string;
    recenter: RefObject<HTMLButtonElement>;
    retry: () => void;
    isFullscreen?: boolean;
    pagesPerView: number; // New optional prop to control 1 or 2 pages per view
    currentPage: number;
}

export default function MusicXMLRenderer({ scoreId, recenter, retry, isFullscreen }: MusicXMLRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
    const debug = !!localStorage.getItem("debug");
    const [renderError, setRenderError] = useState<string | null>(null);

    const updateVisiblePages = () => {
        const container = containerRef.current;
        if (!container || !osmdRef.current) return;
        const containerRect = container.getBoundingClientRect();
        const backends = osmdRef.current.Drawer.Backends;
        if (!backends || backends.length === 0) return;
        for (const backend of backends) {
            const element = backend.getRenderElement();
            if (!element) continue;
            const rect = element.getBoundingClientRect();
            if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
                element.style.display = "none";
            } else {
                element.style.display = "";
            }
        }
    };

    const clearDebugText = () => {
        document.querySelectorAll(".note-pitch-text").forEach(el => el.remove());
    };

    function forEachNote(func: (note: GraphicalNote) => void) {
        if (!osmdRef.current) return;
        osmdRef.current.GraphicSheet.MeasureList.forEach(measureRow =>
            measureRow.forEach(measure =>
                measure.staffEntries.forEach(staffEntry =>
                    staffEntry.graphicalVoiceEntries.forEach(voiceEntry => voiceEntry.notes.forEach(func)))
            )
        );
    }

    const drawDebugText = () => {
        const svg = document.querySelector("#osmdSvgPage1");
        if (!svg) return;
        let i = 1;
        forEachNote(note => {
            const bbox = note.PositionAndShape;
            const s = (i++) + ": " + note.graphicalNoteLength.toString() + " " +
                // @ts-expect-error protected elements access
                (note.sourceNote.pitch ? note.sourceNote.pitch.ToStringShortGet : "null");
            const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            const pos = bbox.AbsolutePosition;
            textEl.setAttribute("x", (pos.x * 10 - 50).toString());
            textEl.setAttribute("y", (pos.y * 10).toString());
            textEl.setAttribute("fill", "purple");
            textEl.setAttribute("font-size", "11");
            textEl.setAttribute("class", "note-pitch-text");
            textEl.textContent = s;
            svg.appendChild(textEl);
        });
    };

    const { data: musicXML, isError, refetch, isFetching } = useQuery({
        queryKey: ['musicXMLBase64', scoreId],
        queryFn: async () => await fetch(`/api/score/as-base64/${scoreId}`).then(res => res.text())
    });

    const fetchAndRender = useCallback(async () => {
        if (!containerRef.current || !musicXML) return;
        try {
            if (!osmdRef.current) {
                const options: IOSMDOptions = {
                    backend: "svg",
                    drawTitle: true,
                    autoResize: true,
                };
                osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, options);
            }
            await osmdRef.current.load(atob(musicXML), "Score");
            osmdRef.current.render();
            updateVisiblePages();
            setRenderError(null); // Clear any previous rendering error on success
        } catch (error) {
            console.error("Error processing MusicXML file:", error);
            setRenderError((error as Error).message);
        }
    }, [musicXML]);

    useEffect(() => {
        if (!containerRef.current || !musicXML) return;
        const start = performance.now();
        fetchAndRender().then(() => {
            console.log(`Rendering took ${performance.now() - start}ms`);
        });
    }, [fetchAndRender, musicXML]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const handleScroll = updateVisiblePages;
        container.addEventListener("scroll", handleScroll);
        return () => container.removeEventListener("scroll", handleScroll);
    }, []);

    const handleRetry = () => {
        setRenderError(null);
        refetch();
        retry();
    };

    return (
        <div className="overflow-hidden overflow-x-hidden flex flex-col place-items-center" 
            style={{ 
                height: isFullscreen ? "100vh" : "calc(100vh - 11rem)",
                transition: 'height 0.3s ease'
            }}>
            <ZoomableDiv recenter={recenter}>
                <div
                    ref={containerRef}
                    className={cn(
                      "border flex flex-col justify-center place-items-center p-2",
                      !(isError || renderError) && "bg-gray-50"
                    )}
                    style={{ width: "min(70rem, calc(100vw - 6px))" }}
                >
                    {(isError || renderError) && (
                        <div className="text-red-600 text-sm p-4">
                            <h1 className="text-xl">An error occured</h1>
                            <p className="my-4">{renderError}</p>
                            <Button variant="outline" size="sm" onClick={handleRetry} disabled={isFetching}>
                                {isFetching ? 'Retrying...' : 'Retry'}
                            </Button>
                        </div>
                    )}
                </div>
            </ZoomableDiv>
            {debug && (
                <div className="fixed top-[100px] right-[100px] bg-gray-700 flex gap-4 p-4 rounded-2xl">
                    <Button onClick={fetchAndRender}>Rerender</Button>
                    <Button onClick={drawDebugText}>Draw debug text</Button>
                    <Button onClick={clearDebugText}>Clear debug text</Button>
                </div>
            )}
        </div>
    );
}
