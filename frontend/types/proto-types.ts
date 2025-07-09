import { Message } from "protobufjs";

export interface Note extends Message {
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

export interface NoteList extends Message {
  notes: Note[];
  size: number[];
}

// Protobuf returns EditOperation names literally
export enum EditOperation {
  INSERT = "INSERT",
  SUBSTITUTE = "SUBSTITUTE",
  DELETE = "DELETE",
}

export interface Edit extends Message {
  operation: EditOperation;
  pos: number;
  sChar: Note;
  tChar: Note;
  tPos: number;
}

export interface TempoSection extends Message {
  startIndex: number;
  endIndex: number;
  tempo: number;
}

export interface ScoringResult extends Message {
  edits: Edit[];
  size: number[];
  unstableRate: number;
  tempoSections: TempoSection[];
}
