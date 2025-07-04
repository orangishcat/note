import { NoteList, ScoringResult } from "@/types/proto-types";

export interface DebugPanelProps {
  scoreId: string;
  editList: ScoringResult | null;
  setEditList: (e: ScoringResult | null) => void;
  playedNotes: NoteList | null;
  scoreNotes: NoteList | null;
  currentPage: number;
  editsOnPage: number;
  setPlayedNotes: (p: NoteList | null) => void;
  confidenceFilter: number;
  setConfidenceFilter: (v: number) => void;
}
