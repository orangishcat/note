export interface Note {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;

  page: number;
  track: number;
  bbox: number[];
  confidence: number;
  id: number;
}

export interface NoteList {
  notes: Note[];
  size: number[];
}

export enum EditOperation {
  INSERT = 0,
  SUBSTITUTE = 1,
  DELETE = 2,
}

export interface Edit {
  operation: EditOperation;
  pos: number;
  sChar: Note;
  tChar: Note;
  tPos: number;
}

export interface TempoSection {
  startIndex: number;
  endIndex: number;
  tempo: number;
}

export interface ScoringResult {
  edits: Edit[];
  size: number[];
  unstableRate: number;
  tempoSections: TempoSection[];
}

export interface Recording {
  $id: string;
  $createdAt: string;
  user_id: string;
  file_id: string;
}
