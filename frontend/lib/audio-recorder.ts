// lib/audio-recorder.ts
import { useCallback, useEffect, useRef } from "react";
import { Type } from "protobufjs";
import api from "@/lib/network";
import log from "./logger";
import { RecordRTCPromisesHandler } from "recordrtc";
import { NoteList, ScoringResult } from "@/types/proto-types";

export interface RecordingError {
  message: string;
  code?: string;
  details?: unknown;
}

export interface AudioRecorderHookProps {
  isRecording: boolean;
  ScoringResultType: Type | null;
  NoteListType: Type | null;
  scoreId: string;
  notesId: string;
  refetchTypes: () => Promise<{
    ScoringResultType: Type | null;
    NoteListType: Type | null;
  }>;
  onEditListChange: (editList: ScoringResult | null) => void;
  onPlayedNotesChange: (playedNotes: NoteList | null) => void;
  onError?: (error: RecordingError) => void;
}

export function splitCombinedResponse(
  buffer: ArrayBuffer,
  ScoringResultType: Type,
  NoteListType: Type,
): { editList: ScoringResult | null; playedNotes: NoteList | null } {
  try {
    const dataView = new Uint8Array(buffer);
    const editListSize = new DataView(dataView.slice(0, 4).buffer).getUint32(
      0,
      false,
    );
    log.debug(`EditList size: ${editListSize} bytes`);

    const editListData = dataView.slice(4, 4 + editListSize);
    const playedNotesData = dataView.slice(4 + editListSize);

    const editList = ScoringResultType.decode(editListData) as ScoringResult;
    const playedNotes = NoteListType.decode(playedNotesData) as NoteList;

    log.debug(
      `Decoded EditList (${editList.edits.length ?? 0} edits), NoteList (${
        playedNotes.notes?.length ?? 0
      } notes)`,
    );
    return { editList, playedNotes };
  } catch (error) {
    log.error("Error splitting combined response:", error);
    return { editList: null, playedNotes: null };
  }
}

export function useAudioRecorder({
  isRecording,
  ScoringResultType,
  NoteListType,
  scoreId,
  notesId,
  onEditListChange,
  onPlayedNotesChange,
  onError,
}: AudioRecorderHookProps) {
  const recorderRef = useRef<RecordRTCPromisesHandler | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRequestTime = useRef(0);
  const MIN_INTERVAL = 2000;

  const handleError = useCallback(
    (error: unknown) => {
      const msg = (error as Error)?.message ?? String(error);
      log.error("AudioRecorder Error:", error);
      onError?.({ message: msg, details: error });
      recorderRef.current = null;
    },
    [onError],
  );

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

  const startRecording = useCallback(async () => {
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
  }, [MIN_INTERVAL, handleError]);

  const stopRecording = useCallback(async () => {
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
      let editList: ScoringResult | null,
        playedNotes: NoteList | null = null;

      if (fmt === "combined") {
        ({ editList, playedNotes } = splitCombinedResponse(
          buffer,
          ScoringResultType!,
          NoteListType!,
        ));
      } else {
        editList = ScoringResultType!.decode(
          new Uint8Array(buffer),
        ) as ScoringResult;
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
  }, [
    NoteListType,
    ScoringResultType,
    notesId,
    onEditListChange,
    onPlayedNotesChange,
    onError,
    scoreId,
  ]);

  useEffect(() => {
    if (isRecording) startRecording();
    else stopRecording();
    return () => {
      cleanup();
    };
  }, [isRecording, scoreId, notesId, startRecording, stopRecording]);

  return { hasPermission: !!streamRef.current };
}
