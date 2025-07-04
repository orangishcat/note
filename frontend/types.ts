export interface Note {
  [key: string]: unknown;
}

export interface Edit {
  sChar?: {
    confidence?: number;
    t_pos?: number;
  };
  t_pos?: number;
  tPos?: number;
  page?: number;
  pitch?: number;
  duration?: number;
  pos?: number;
  position?: number;
  [key: string]: unknown;
}

export interface EditList {
  edits?: Edit[];
  unstableRate?: number;
  size?: unknown;
  tempoSections?: { startIndex: number; endIndex: number }[];
  [key: string]: unknown;
}

export interface NoteList {
  notes?: Note[];
  [key: string]: unknown;
}

export interface Recording {
  $id: string;
  $createdAt: string;
  user_id: string;
  file_id: string;
}
