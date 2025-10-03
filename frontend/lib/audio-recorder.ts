import { useCallback, useEffect, useRef } from "react";
import { Type } from "protobufjs";
import api from "@/lib/network";
import log from "./logger";
import type { RecordRTCPromisesHandler } from "recordrtc";
import { NoteList, Recording, ScoringResult } from "@/types/proto-types";
export interface RecordingError {
  message: string;
  code?: string;
  details?: unknown;
}
export interface AudioRecorderHookProps {
  isRecording: boolean;
  RecordingType: Type | null;
  scoreId: string;
  notesId: string;
  focusedPage?: string;
  refetchTypes: () => Promise<{
    RecordingType: Type | null;
    ScoringResultType: Type | null;
    NoteListType: Type | null;
  }>;
  onEditListChange: (editList: ScoringResult | null) => void;
  onPlayedNotesChange?: (playedNotes: NoteList | null) => void;
  onError?: (error: RecordingError) => void;
}
export function useAudioRecorder({
  isRecording,
  RecordingType,
  scoreId,
  notesId,
  focusedPage,
  refetchTypes,
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
    if (typeof window === "undefined") return;
    if (Date.now() - lastRequestTime.current < MIN_INTERVAL) return;
    lastRequestTime.current = Date.now();
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }
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
      const response = await api.post("/score/receive-audio", blob, {
        headers: {
          "Content-Type": blob.type,
          "X-Score-ID": scoreId,
          "X-Notes-ID": notesId,
          "X-Focused-Page": focusedPage ?? "0",
        },
        responseType: "arraybuffer",
      });
      const buffer = response.data as ArrayBuffer;
      let recordingType = RecordingType;
      if (!recordingType) {
        log.warn("RecordingType not ready; attempting refetch");
        const types = await refetchTypes();
        if (!types.RecordingType) {
          throw new Error("Recording protobuf type unavailable");
        }
        recordingType = types.RecordingType;
      }
      if (!recordingType) {
        throw new Error(
          "Recording protobuf type still unavailable after refetch",
        );
      }
      const recordingMessage = recordingType.decode(
        new Uint8Array(buffer),
      ) as Recording;
      const recordingObject = recordingType.toObject(recordingMessage, {
        defaults: true,
        enums: String,
        longs: Number,
      }) as Recording;
      onEditListChange(recordingObject.computedEdits ?? null);
      if (recordingObject.playedNotes) {
        onPlayedNotesChange?.(recordingObject.playedNotes);
      }
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
    RecordingType,
    focusedPage,
    notesId,
    refetchTypes,
    onEditListChange,
    onPlayedNotesChange,
    onError,
    scoreId,
  ]);
  useEffect(() => {
    if (isRecording) void startRecording();
    else void stopRecording();
    return () => {
      void cleanup();
    };
  }, [isRecording, scoreId, notesId]);
  return { hasPermission: !!streamRef.current };
}
