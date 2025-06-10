"use client";
import React, { useEffect, useRef, useState } from "react";
import { databases } from "@/lib/appwrite";
import { Button } from "@/components/ui/button";
import api from "@/lib/network";
import log from "@/lib/logger";

interface RecordingsModalProps {
  open: boolean;
  onClose: () => void;
  scoreId: string;
  onLoad: (editList: any) => void;
}

interface RecordingDoc {
  $id: string;
  $createdAt: string;
  user_id: string;
  file_id: string;
}

const RecordingsModal: React.FC<RecordingsModalProps> = ({
  open,
  onClose,
  scoreId,
  onLoad,
}) => {
  const [recs, setRecs] = useState<RecordingDoc[]>([]);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) return;
    async function fetchRecs() {
      try {
        const res = await databases.listDocuments(
          process.env.NEXT_PUBLIC_DATABASE!,
          process.env.NEXT_PUBLIC_RECORDINGS_COLLECTION!,
          [
            (window as any).AppwriteQuery?.equal
              ? (window as any).AppwriteQuery.equal("score_id", scoreId)
              : undefined,
          ].filter(Boolean) as any,
        );
        setRecs(res.documents as any);
      } catch (e) {
        log.error("Failed fetching recordings", e);
      }
    }
    fetchRecs();
  }, [open, scoreId]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    startRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging) return;
      setPosition({
        x: e.clientX - startRef.current.x,
        y: e.clientY - startRef.current.y,
      });
    };
    const up = () => setDragging(false);
    if (dragging) {
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    }
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, [dragging]);

  const viewRecording = async (id: string) => {
    try {
      const res = await api.post(`/process-recording/${id}?score=${scoreId}`);
      onLoad(res.data);
      onClose();
    } catch (e) {
      log.error("process recording failed", e);
    }
  };

  if (!open) return null;
  return (
    <div
      className="fixed z-50 bg-gray-800/90 text-white rounded-md shadow-lg p-2"
      style={{ left: position.x, top: position.y, width: "15rem" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="absolute top-0 left-0 right-0 h-7 bg-gray-700/80 rounded-t-md flex items-center px-2 cursor-grab"
        onMouseDown={handleMouseDown}
      >
        <span className="text-xs font-semibold">Recordings</span>
        <button
          onClick={onClose}
          className="absolute right-2 top-1 text-gray-300 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="mt-7 max-h-60 overflow-auto space-y-2">
        {recs.length === 0 ? (
          <div className="text-center text-gray-300 italic">
            No recordings yet
          </div>
        ) : (
          recs.map((r) => (
            <div
              key={r.$id}
              className="flex justify-between items-center bg-gray-700/40 p-1 rounded"
            >
              <span className="text-xs">
                {new Date(r.$createdAt).toLocaleString()}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => viewRecording(r.file_id)}
              >
                View
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RecordingsModal;
