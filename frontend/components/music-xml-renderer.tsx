"use client";

import React, { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { storage } from "@/lib/appwrite";
import { MusicXMLRendererProps } from "@/types/score-types";
import JSZip from "jszip";

function isZip(buf: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buf);
  return (
    u8.length >= 4 &&
    u8[0] === 0x50 &&
    u8[1] === 0x4b &&
    u8[2] === 0x03 &&
    u8[3] === 0x04
  );
}

async function extractMusicXMLFromMXL(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);

  // Try container.xml first (spec-compliant MXL)
  const containerPath = "META-INF/container.xml";
  const containerFile = zip.file(containerPath);

  let xmlPath: string | undefined;

  if (containerFile) {
    const containerXml = await containerFile.async("string");
    const dom = new DOMParser().parseFromString(
      containerXml,
      "application/xml",
    );
    const rootfile = dom.querySelector("rootfile");
    xmlPath = rootfile?.getAttribute("full-path") ?? undefined;
  }

  // Fallbacks: common names or first .xml we find
  if (!xmlPath) {
    const candidates = ["score.xml", "musicxml.xml"];
    for (const c of candidates)
      if (zip.file(c)) {
        xmlPath = c;
        break;
      }
  }
  if (!xmlPath) {
    const firstXml = Object.keys(zip.files).find((p) =>
      p.toLowerCase().endsWith(".xml"),
    );
    if (firstXml) xmlPath = firstXml;
  }

  if (!xmlPath) throw new Error("Could not locate MusicXML file inside .mxl");
  return await zip.file(xmlPath)!.async("string");
}

export default function MusicXMLRenderer({
  scoreId,
  retry,
}: MusicXMLRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!containerRef.current) return;

      if (!osmdRef.current) {
        osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          backend: "svg",
        });
      }

      const fetchAndParse = async (url: string): Promise<string> => {
        // todo: uses fetch so MSW in tests can intercept cross-origin requests reliably, but should replace with axios
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok)
          throw new Error(`Failed to fetch MusicXML: ${resp.status}`);
        const buf = await resp.arrayBuffer();
        if (isZip(buf)) {
          return await extractMusicXMLFromMXL(buf);
        }
        const text = new TextDecoder("utf-8").decode(buf).trim();
        if (text.startsWith("<!DOCTYPE html") || text.startsWith("<html")) {
          throw new Error("Received HTML instead of MusicXML");
        }
        return text;
      };

      try {
        // Try the "view" endpoint first (tests mock this), fallback to download
        const viewUrl = storage.getFileView(
          process.env.NEXT_PUBLIC_SCORES_BUCKET!,
          scoreId,
        );
        let xmlText: string;
        try {
          xmlText = await fetchAndParse(viewUrl);
        } catch {
          const downloadUrl = storage.getFileDownload(
            process.env.NEXT_PUBLIC_SCORES_BUCKET!,
            scoreId,
          );
          xmlText = await fetchAndParse(downloadUrl);
        }

        await osmdRef.current.load(xmlText);
        if (!cancelled) osmdRef.current.render();
      } catch (e) {
        console.error(e);
        if (!cancelled) retry();
      }
    }

    void render();

    return () => {
      cancelled = true;
      if (osmdRef.current) {
        try {
          osmdRef.current.clear();
        } catch {}
      }
    };
  }, [scoreId, retry]);

  return (
    <div
      id={`score-${scoreId}`}
      className="relative h-full w-full overflow-x-hidden"
    >
      {/* OSMD render target */}
      <div ref={containerRef} className="bg-white w-full min-h-[600px]" />
      {/* Overlay container used by useEditDisplay to draw annotations */}
      <div className="absolute inset-0 score-container pointer-events-none" />
    </div>
  );
}
