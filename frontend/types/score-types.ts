import type { Models } from "appwrite";
import { RefObject } from "react";

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
  recenter: RefObject<HTMLButtonElement>;
  retry: () => void;
  isFullscreen?: boolean;
  pagesPerView: number; // New optional prop to control 1 or 2 pages per view
  currentPage: number;
}

export interface ImageScoreRendererProps extends MusicXMLRendererProps {
  setPage: (page: number) => void;
  displayMode?: "paged" | "scroll";
  verticalLoading?: boolean;
}
