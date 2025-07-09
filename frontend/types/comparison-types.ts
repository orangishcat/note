import { Note, NoteList } from "@/types/proto-types";

export interface ComparisonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note;
  targetNote?: Note;
  editOperation?: string;
  position?: number;
  playedNotes?: NoteList | null;
  scoreNotes?: NoteList | null;
}
