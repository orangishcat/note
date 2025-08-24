"use client";

import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDrag } from "@use-gesture/react";
import { clamp } from "@radix-ui/number";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

import ZoomableDiv from "@/components/ui-custom/zoomable-div";
import { ImageScoreRendererProps } from "@/types/score-types";
import api from "@/lib/network";
import { storage } from "@/lib/appwrite";

interface PageData {
  url: string;
  width: number;
  height: number;
}

export default function ImageScoreRenderer({
  scoreId,
  recenter,
  currentPage,
  pagesPerView: _pagesPerView,
  setPage,
  displayMode = "paged",
  verticalLoading = false,
}: ImageScoreRendererProps) {
  void _pagesPerView;
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const { data: pages = [] } = useQuery({
    queryKey: ["pdf-score", scoreId],
    queryFn: async () => {
      const url = storage.getFileDownload(
        process.env.NEXT_PUBLIC_SCORES_BUCKET!,
        scoreId,
      );
      const res = await api.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
      });
      const pdf = await getDocument({ data: res.data }).promise;
      const result: PageData[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx!, viewport }).promise;
        result.push({
          url: canvas.toDataURL(),
          width: viewport.width,
          height: viewport.height,
        });
      }
      return result;
    },
  });

  useEffect(() => {
    if (pages.length) {
      document.dispatchEvent(
        new CustomEvent("score:pageInfo", {
          detail: { totalPages: pages.length, scoreId },
          bubbles: true,
        }),
      );
    }
  }, [pages, scoreId]);

  useEffect(() => {
    document.dispatchEvent(
      new CustomEvent("score:pageChange", {
        detail: { currentPage, scoreId },
        bubbles: true,
      }),
    );
  }, [currentPage, scoreId]);

  useEffect(() => {
    document.dispatchEvent(
      new CustomEvent("score:redrawAnnotations", { bubbles: true }),
    );
  }, [pages, currentPage]);

  const bind = useDrag(({ active, movement: [mx] }) => {
    if (verticalLoading || pages.length === 0) return;
    const width = containerRef.current?.clientWidth || 1;
    if (active) {
      setDragOffset((mx / width) * 100);
    } else {
      if (Math.abs(mx) > width / 4) {
        const dir = mx < 0 ? 1 : -1;
        const next = clamp(currentPage + dir, [0, pages.length - 1]);
        setPage(next);
      }
      setDragOffset(0);
    }
  });

  if (displayMode === "scroll") {
    return (
      <div
        id={`score-${scoreId}`}
        className="flex h-full w-full flex-col items-center"
      >
        <ZoomableDiv recenter={recenter}>
          <div className="score-container">
            {pages.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p.url} alt="" className="w-full" />
            ))}
          </div>
        </ZoomableDiv>
      </div>
    );
  }

  const translate = verticalLoading
    ? `translateY(${-currentPage * 100}%)`
    : `translateX(${dragOffset - currentPage * 100}%)`;

  return (
    <div
      id={`score-${scoreId}`}
      className="relative flex h-full flex-col items-center overflow-hidden"
    >
      <ZoomableDiv recenter={recenter}>
        <div
          ref={containerRef}
          className="score-container overflow-hidden"
          style={{ minWidth: 800, minHeight: 1000 }}
          {...bind()}
        >
          <div
            className="flex h-full w-full"
            style={{
              flexDirection: verticalLoading ? "column" : "row",
              transform: translate,
              transition: dragOffset === 0 ? "transform 0.3s" : undefined,
            }}
          >
            {pages.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={p.url}
                alt=""
                style={{
                  width: "100%",
                  height: "auto",
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>
      </ZoomableDiv>
    </div>
  );
}
