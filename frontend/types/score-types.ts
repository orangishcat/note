import type { Models } from "appwrite";
import { RefObject } from "react";
import { ScoringResult } from "@/types/proto-types";

export interface MusicScore extends Models.Document {
  /** Appwrite document identifier */
  $id: string;
  $collectionId: string;
  $databaseId: string;
  $createdAt: string;
  name: string;
  subtitle: string;
  user_id: string;
  file_id: string;
  notes_id?: string;
  preview_id?: string;
  audio_file_id?: string;
  mime_type: string;
  starred_users: string[];
  total_pages?: number;
  is_mxl?: boolean;
  starred?: boolean;
  folder?: string;
}

export interface MusicXMLRendererProps {
  scoreId: string;
  retry: () => void;
  currentPage?: number;
  recenter: RefObject<HTMLButtonElement>;
}

export interface ImageScoreRendererProps {
  scoreId: string;
  retry: () => void;
  recenter: RefObject<HTMLButtonElement>;
  currentPage: number;
  pagesPerView: number;
  setPage: (page: number) => void;
  displayMode?: "paged" | "scroll";
  verticalLoading?: boolean;
  editList?: ScoringResult | null;
  confidenceFilter?: number;
  onCanvasWrappersChange?: (wrappers: HTMLDivElement[]) => void;
}
