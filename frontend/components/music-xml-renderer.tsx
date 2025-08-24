"use client";

import React, { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { storage } from "@/lib/appwrite";
import { MusicXMLRendererProps } from "@/types/score-types";
import api from "@/lib/network";

export default function MusicXMLRenderer({
  scoreId,
  retry,
}: MusicXMLRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function render() {
      if (!containerRef.current) return;

      if (!osmdRef.current) {
        osmdRef.current = new OpenSheetMusicDisplay(containerRef.current);
      }

      try {
        const fileUrl = storage.getFileView(
          process.env.NEXT_PUBLIC_SCORES_BUCKET!,
          scoreId,
        );

        const resp = await api.get<ArrayBuffer>(fileUrl, {
          responseType: "arraybuffer",
        });

        const ct =
          resp.headers["content-type"] ||
          "application/vnd.recordare.musicxml+zip";

        const blob = new Blob([resp.data], { type: ct });
        objectUrl = URL.createObjectURL(blob);

        await osmdRef.current.load(objectUrl);
        if (!cancelled) {
          osmdRef.current.render();
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) retry();
      }
    }

    void render();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (osmdRef.current) {
        try {
          osmdRef.current.clear();
        } catch {}
      }
    };
  }, [scoreId, retry]);

  return <div ref={containerRef} />;
}
