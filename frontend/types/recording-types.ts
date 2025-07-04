import { Message } from "protobufjs";
import { Models } from "appwrite";

export interface Recording extends Message {
  $id: string;
  $createdAt: string;
  user_id: string;
  file_id: string;
}

export interface RecordingsModalProps {
  open: boolean;
  onClose: () => void;
  scoreId: string;
  onLoad: (editList: ArrayBuffer) => void;
}

export interface RecordingDoc extends Models.Document {
  $id: string;
  $createdAt: string;
  user_id: string;
  file_id: string;
}
