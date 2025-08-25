"use client";

import React, { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { storage } from "@/lib/appwrite";
import { MusicXMLRendererProps } from "@/types/score-types";
import api from "@/lib/network";
import JSZip from "jszip";
import ZoomableDiv from "@/components/ui-custom/zoomable-div";

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
        });
      }

      try {
        // Prefer the download endpoint; it’s friendlier for binary
        const url = storage.getFileDownload(
          process.env.NEXT_PUBLIC_SCORES_BUCKET!,
          scoreId,
        );

        const resp = await api.get<ArrayBuffer>(url, {
          responseType: "arraybuffer",
          withCredentials: true,
          transformResponse: [(d) => d], // keep raw
          headers: { Accept: "application/octet-stream" },
        });

        const buf = resp.data;

        let xmlText: string;

        if (isZip(buf)) {
          // .mxl: unzip and pull out the inner score.xml
          xmlText = await extractMusicXMLFromMXL(buf);
        } else {
          // Plain MusicXML (.xml)
          const text = new TextDecoder("utf-8").decode(buf).trim();

          // Guard: if it’s HTML, it’s an auth/CORS error page
          if (text.startsWith("<!DOCTYPE html") || text.startsWith("<html")) {
            throw new Error(
              "Received HTML instead of MusicXML. Check credentials/CORS/permissions.",
            );
          }
          xmlText = text;
        }

        await osmdRef.current.load(xmlText); // TS-safe: string | Document
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
    <div className="relative h-full">
      <div ref={containerRef} className="bg-white" />
    </div>
  );
}
