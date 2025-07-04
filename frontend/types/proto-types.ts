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

export enum EditOperation {
  INSERT = 0,
  SUBSTITUTE = 1,
  DELETE = 2,
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
