import React from "react";
import { Message } from "protobufjs";
import { midiPitchToNoteName } from "@/lib/edit-display";
import { Note } from "@/types/proto-types";

interface ComparisonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note;
  targetNote?: Note;
  editOperation?: string;
  position?: number;
  playedNotes?: Message | null;
  scoreNotes?: Message | null;
}

function extractNotes(message: Message | null | undefined): Note[] {
  if (!message) return [];
  const anyMsg = message as unknown as Record<string, unknown>;
  if (Array.isArray(anyMsg.notes)) return anyMsg.notes as Note[];
  if (typeof message.toJSON === "function") {
    const json = message.toJSON() as Record<string, unknown>;
    if (Array.isArray(json.notes)) return json.notes as Note[];
  }
  return [];
}

function sliceAround(
  notes: Note[],
  index: number | undefined,
  count: number,
): Note[] {
  if (index === undefined) return [];
  const start = Math.max(0, index - count);
  const end = Math.min(notes.length, index + count + 1);
  return notes.slice(start, end);
}

const ComparisonDialog: React.FC<ComparisonDialogProps> = ({
  isOpen,
  onClose,
  note,
  targetNote,
  editOperation,
  position,
  playedNotes,
  scoreNotes,
}) => {
  if (!isOpen) return null;

  const played = extractNotes(playedNotes);
  const score = extractNotes(scoreNotes);

  const targetPos = targetNote?.pitch;

  const playedSlice = sliceAround(played, position, 5);
  const scoreSlice = sliceAround(score, targetPos, 5);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-gray-800 text-white rounded p-4 w-96 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-2">Edit Details</h2>
        <pre className="text-xs whitespace-pre-wrap break-all bg-gray-900 p-2 rounded">
          {JSON.stringify(
            { note, targetNote, editOperation, position },
            null,
            2,
          )}
        </pre>
        <h3 className="mt-4 font-semibold">Played Notes Near Start</h3>
        <ul className="text-sm mt-1 space-y-1">
          {playedSlice.map((n) => (
            <li key={n.id} className="flex justify-between">
              <span className="font-mono">{n.id}</span>
              <span>{midiPitchToNoteName(n.pitch)}</span>
              <span className="text-gray-400">{n.startTime.toFixed(3)}</span>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 font-semibold">Score Notes Near Target</h3>
        <ul className="text-sm mt-1 space-y-1">
          {scoreSlice.map((n) => (
            <li key={n.id} className="flex justify-between">
              <span className="font-mono">{n.id}</span>
              <span>{midiPitchToNoteName(n.pitch)}</span>
              <span className="text-gray-400">{n.startTime.toFixed(3)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-sm px-3 py-1 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComparisonDialog;
