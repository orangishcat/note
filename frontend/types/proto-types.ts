import { type Long, Message } from "protobufjs";
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
  voices: Voice[];
  lines: Line[];
}
export enum EditOperation {
  INSERT = "INSERT",
  SUBSTITUTE = "SUBSTITUTE",
  DELETE = "DELETE",
}
export enum Clef {
  TREBLE = 0,
  BASS = 1,
}
export interface Edit extends Message {
  operation: EditOperation;
  pos: number;
  sChar: Note;
  tChar: Note;
  tPos: number;
}
export interface Voice extends Message {
  clef: Clef;
  track: number;
  group: number;
  bbox: number[];
}
export interface Line extends Message {
  clefs: Clef[];
  group: number;
  bbox: number[];
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
export interface Timestamp extends Message {
  seconds: number | Long;
  nanos: number;
}
export interface Recording extends Message {
  playedNotes: NoteList;
  computedEdits: ScoringResult;
  createdAt: Timestamp;
}
