"use client";
import React, { useEffect, useState } from "react";
import { databases } from "@/lib/appwrite";
import { Button } from "@/components/ui/button";
import api from "@/lib/network";
import log from "@/lib/logger";
import { EditList } from "@/types";

interface RecordingsModalProps {
  open: boolean;
  onClose: () => void;
  scoreId: string;
  onLoad: (editList: EditList) => void;
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
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) setVisible(true);
    else setTimeout(() => setVisible(false), 300);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    async function fetchRecs() {
      try {
        const res = await databases.listDocuments(
          process.env.NEXT_PUBLIC_DATABASE!,
          process.env.NEXT_PUBLIC_RECORDINGS_COLLECTION!,
          [
            (window as unknown as { AppwriteQuery?: { equal: (k: string, v: string) => unknown } }).AppwriteQuery?.equal
              ? (window as unknown as { AppwriteQuery: { equal: (k: string, v: string) => unknown } }).AppwriteQuery.equal("score_id", scoreId)
              : undefined,
          ].filter(Boolean) as unknown[],
        );
        setRecs(res.documents as RecordingDoc[]);
      } catch (e) {
        log.error("Failed fetching recordings", e);
      }
    }
    fetchRecs();
  }, [open, scoreId]);


  const viewRecording = async (id: string) => {
    try {
      const res = await api.post(`/process-recording/${id}?score=${scoreId}`);
      onLoad(res.data);
      onClose();
    } catch (e) {
      log.error("process recording failed", e);
    }
  };

  if (!visible) return null;
  return (
    <div
      className={`fixed bottom-20 left-12 z-50 w-80 min-w-64 min-h-16 rounded-md bg-gray-800/90 p-2 text-white shadow-lg ${
        open ? "animate-slide-in-up" : "animate-slide-out-down"
      }`}
      onAnimationEnd={() => {
        if (!open) setVisible(false);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute left-0 right-0 top-0 flex h-7 items-center rounded-t-md bg-gray-700/80 px-2">
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

