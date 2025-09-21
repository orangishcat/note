import { ScoringResult } from "@/types/proto-types";

export interface DebugPanelProps {
  scoreId: string;
  editList: ScoringResult | null;
  setEditList: (e: ScoringResult | null) => void;
  currentPage: number;
  editsOnPage: number;
  confidenceFilter: number;
  setConfidenceFilter: (v: number) => void;
}
