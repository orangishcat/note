// lib/audio-recorder.ts
import { useEffect, useRef } from "react";
import { Message, Type } from "protobufjs";
import api from "@/lib/network";
import log from "./logger";

export interface RecordingError {
  message: string;
  code?: string;
  details?: any;
}

export interface AudioRecorderHookProps {
  isRecording: boolean;
  EditListType: Type | null;
  NoteListType: Type | null;
  scoreId: string;
  notesId: string;
  refetchTypes: () => Promise<{
    EditListType: Type | null;
    NoteListType: Type | null;
  }>;
  onEditListChange: (editList: Message | null) => void;
  onPlayedNotesChange: (playedNotes: Message | null) => void;
  onError?: (error: RecordingError) => void;
}

export function splitCombinedResponse(
  buffer: ArrayBuffer,
  EditListType: Type,
  NoteListType: Type,
): { editList: Message | null; playedNotes: Message | null } {
  try {
    const dataView = new Uint8Array(buffer);
    const editListSize = new DataView(dataView.slice(0, 4).buffer).getUint32(
      0,
      false,
    );
    log.debug(`EditList size: ${editListSize} bytes`);

    const editListData = dataView.slice(4, 4 + editListSize);
    const playedNotesData = dataView.slice(4 + editListSize);

    const editList = EditListType.decode(editListData);
    const playedNotes = NoteListType.decode(playedNotesData);

    log.debug(
      `Decoded EditList (${(editList as any).edits
        ?.length} edits), NoteList (${(playedNotes as any).notes
        ?.length} notes)`,
    );
    return { editList, playedNotes };
  } catch (error) {
    log.error("Error splitting combined response:", error);
    return { editList: null, playedNotes: null };
  }
}

export function useAudioRecorder({
  isRecording,
  EditListType,
  NoteListType,
  scoreId,
  notesId,
  onEditListChange,
  onPlayedNotesChange,
  onError,
}: AudioRecorderHookProps) {
  const recorderRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRequestTime = useRef(0);
  const MIN_INTERVAL = 2000;

  const handleError = (error: any) => {
    const msg = error?.message ?? String(error);
    log.error("AudioRecorder Error:", error);
    onError?.({ message: msg, details: error });
    recorderRef.current = null;
  };

  const cleanup = async () => {
    if (recorderRef.current) {
      try {
        await recorderRef.current.stopRecording();
      } catch {}
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  async function startRecording() {
    if (typeof window === "undefined") return; // no-op on server
    if (Date.now() - lastRequestTime.current < MIN_INTERVAL) return;
    lastRequestTime.current = Date.now();

    try {
      // get mic
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }

      // dynamically import RecordRTC and only in browser
      const { RecordRTCPromisesHandler, StereoAudioRecorder } = await import(
        "recordrtc"
      );
      recorderRef.current = new RecordRTCPromisesHandler(streamRef.current, {
        type: "audio",
        mimeType: "audio/webm",
        disableLogs: true,
        recorderType: StereoAudioRecorder,
      });

      await recorderRef.current.startRecording();
    } catch (e) {
      handleError(e);
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) {
      log.warn("No recorder instance found on stop");
      return;
    }

    try {
      await recorder.stopRecording();
      const blob = await recorder.getBlob();
      log.debug(`Recorded blob size: ${blob.size}, type: ${blob.type}`);

      const response = await api.post("/audio/receive", blob, {
        headers: {
          "Content-Type": blob.type,
          "X-Score-ID": scoreId,
          "X-Notes-ID": notesId,
        },
        responseType: "arraybuffer",
      });

      const buffer = response.data as ArrayBuffer;
      const fmt = response.headers["x-response-format"];
      let editList: Message | null,
        playedNotes: Message | null = null;

      if (fmt === "combined") {
        ({ editList, playedNotes } = splitCombinedResponse(
          buffer,
          EditListType!,
          NoteListType!,
        ));
      } else {
        editList = EditListType!.decode(new Uint8Array(buffer));
      }

      // Clone to avoid accidental mutations downstream
      const editListCopy = JSON.parse(JSON.stringify(editList));
      onEditListChange(editListCopy);
      if (playedNotes) onPlayedNotesChange(playedNotes);
    } catch (err) {
      log.error("Error stopping/processing recording:", err);
      onError?.({
        message: err instanceof Error ? err.message : String(err),
        details: err,
      });
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
    }
  }

  useEffect(() => {
    if (isRecording) startRecording();
    else stopRecording();
    return () => {
      cleanup();
    };
  }, [isRecording, scoreId, notesId]);

  return { hasPermission: !!streamRef.current };
}
