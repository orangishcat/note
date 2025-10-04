"use client";
import { useParams, useRouter } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftCircle,
  ArrowRightCircle,
  BarChart2,
  Cable,
  Clock,
  Download,
  Fullscreen,
  Maximize2,
  Mic,
  Minimize2,
  Piano,
  SquareIcon,
  Star,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import MusicXMLRenderer from "@/components/music-xml-renderer";
import { useQuery } from "@tanstack/react-query";
import BasicTooltip from "@/components/ui-custom/basic-tooltip";
import axios from "axios";
import ImageScoreRenderer from "@/components/image-score-renderer";
import { Type } from "protobufjs";
import log from "@/lib/logger";
import { Edit, NoteList, Recording, ScoringResult } from "@/types/proto-types";
import { useToast } from "@/components/ui/toast";
import { databases, storage } from "@/lib/appwrite";
import { initProtobufTypes, protobufTypeCache } from "@/lib/proto";
import DebugPanel from "@/components/DebugPanel";
import api from "@/lib/network";
import RecordingsModal from "@/components/RecordingsModal";
import { type RecordingError, useAudioRecorder } from "@/lib/audio-recorder";
import { MusicScore } from "@/types/score-types";
import { useEditDisplay } from "@/lib/edit-display";
import { useEditDisplayMusicXML } from "@/lib/edit-display-mxml";
import InputTypeModal from "@/components/InputTypeModal";
import KeyboardPanel from "@/components/note-input/KeyboardPanel";
import type { ScoreInputType } from "@/types/input-types";
import { usePiano } from "@/lib/piano";
import { clampVelocity, useMidiInput } from "@/lib/midi";

type ActiveManualNote = {
  start: number;
  velocity: number;
};

type CapturedNote = {
  midi: number;
  start: number;
  duration: number;
  velocity: number;
};
declare global {
  interface Window {
    lastRefetchTime?: number;
    setScoreSize?: (w: number, h: number) => void;
    __manualCaptureStart?: () => void;
    __manualCaptureStop?: () => Promise<void> | void;
    __manualNoteOn?: (midi: number, velocity?: number) => void;
    __manualNoteOff?: (midi: number) => void;
  }
}
export default function ScorePage() {
  const router = useRouter();
  const { id } = useParams<{
    id: string;
  }>();
  const [score, setScore] = useState<MusicScore>({
    audio_file_id: "",
    file_id: "",
    folder: "",
    is_mxl: false,
    mime_type: "",
    notes_id: "",
    preview_id: "",
    starred: false,
    starred_users: [],
    user_id: "",
    $collectionId: "",
    $databaseId: "",
    $id: "",
    name: "Loading...",
    subtitle: "",
    $createdAt: "",
    $updatedAt: "",
    $permissions: [],
    $sequence: 0,
    total_pages: 1,
  });
  const [editList, setEditList] = useState<ScoringResult | null>(null);
  const [scoreNotes, setScoreNotes] = useState<NoteList | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [displayMode, setDisplayMode] = useState<"paged" | "scroll">("paged");
  const [verticalLoading, setVerticalLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [inputType, setInputType] = useState<ScoreInputType | null>(null);
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [midiSoundEnabled, setMidiSoundEnabled] = useState(true);
  const recordingStartRef = useRef<number | null>(null);
  const manualActiveNotesRef = useRef<Map<number, ActiveManualNote>>(new Map());
  const manualNotesRef = useRef<CapturedNote[]>([]);
  const manualSubmittingRef = useRef(false);
  const lastMidiError = useRef<string | null>(null);
  const [editsOnPage, setEditsOnPage] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(3);
  const [canvasWrappers, setCanvasWrappers] = useState<HTMLDivElement[]>([]);
  const { addToast } = useToast();
  const [recordingCompatible, setRecordingCompatible] = useState<
    boolean | null
  >(null);
  const hasShownCompatibilityToast = useRef(false);
  const updateCanvasWrappers = useCallback((wrappers: HTMLDivElement[]) => {
    setCanvasWrappers((prev) => {
      if (
        prev.length === wrappers.length &&
        prev.every((el, idx) => el === wrappers[idx])
      ) {
        return prev;
      }
      return wrappers;
    });
  }, []);
  useEffect(() => {
    setIsClient(true);
    setIsDebugMode(!!localStorage.getItem("debug"));
    setDisplayMode(
      localStorage.getItem("score.displayAllPages") === "true"
        ? "scroll"
        : "paged",
    );
    setVerticalLoading(localStorage.getItem("score.verticalLoad") === "true");
    const storedInput = localStorage.getItem(
      "score.inputType",
    ) as ScoreInputType | null;
    if (
      storedInput === "audio" ||
      storedInput === "keyboard" ||
      storedInput === "midi"
    ) {
      setInputType(storedInput);
    } else {
      setIsInputModalOpen(true);
    }
    const storedMidiSound = localStorage.getItem("score.midiSound");
    if (storedMidiSound !== null) {
      setMidiSoundEnabled(storedMidiSound === "true");
    }
    const handleStorageChange = () => {
      const debugEnabled = !!localStorage.getItem("debug");
      setIsDebugMode(debugEnabled);
      setDisplayMode(
        localStorage.getItem("score.displayAllPages") === "true"
          ? "scroll"
          : "paged",
      );
      setVerticalLoading(localStorage.getItem("score.verticalLoad") === "true");
      const updatedInput = localStorage.getItem(
        "score.inputType",
      ) as ScoreInputType | null;
      if (
        updatedInput === "audio" ||
        updatedInput === "keyboard" ||
        updatedInput === "midi"
      ) {
        setInputType(updatedInput);
        setIsInputModalOpen(false);
      } else {
        setInputType(null);
        setIsInputModalOpen(true);
      }
      const nextMidiSound = localStorage.getItem("score.midiSound");
      if (nextMidiSound !== null) {
        setMidiSoundEnabled(nextMidiSound === "true");
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);
  useEffect(() => {
    if (!isClient) return;
    try {
      if (isDebugMode) {
        (window as any).__setEditList = (obj: ScoringResult) =>
          setEditList(obj);
      } else {
        delete (window as any).__setEditList;
      }
    } catch {}
  }, [isClient, isDebugMode]);
  const [scoringResultType, setScoringResultType] = useState<Type | null>(
    protobufTypeCache.ScoringResultType,
  );
  const [noteListType, setNoteListType] = useState<Type | null>(
    protobufTypeCache.NoteListType,
  );
  const [recordingType, setRecordingType] = useState<Type | null>(
    protobufTypeCache.RecordingType,
  );
  const refetchTypes = async () => {
    const result = await initProtobufTypes();
    setScoringResultType(result.ScoringResultType);
    setNoteListType(result.NoteListType);
    setRecordingType(result.RecordingType);
    return result;
  };
  const handleRecordingError = useCallback(
    (err: RecordingError) => {
      log.error("Recording error:", err);
      addToast({
        title: "Recording Error",
        description: err.message,
        type: "error",
      });
      setIsRecording(false);
    },
    [addToast],
  );
  useEffect(() => {
    if (!protobufTypeCache.initialized && !protobufTypeCache.initializing)
      void refetchTypes();
  }, []);
  useAudioRecorder({
    isRecording: isRecording && inputType === "audio",
    RecordingType: recordingType,
    scoreId: id,
    notesId: score.notes_id || "",
    focusedPage: currentPage.toString(),
    refetchTypes,
    onEditListChange: setEditList,
    onError: handleRecordingError,
  });

  window.setScoreSize = function (w: number, h: number) {
    if (!scoreNotes) {
      log.warn("No score notes to set size");
      return;
    }

    scoreNotes.size = [w, h];
    setScoreNotes(scoreNotes);
    log.debug("Set size to", w, h);
  };

  useEffect(() => {
    if (score.$id || fetchedDataRef.current) {
      return;
    }
    log.debug(`Fetching score data for ID: ${id}`);
    fetchedDataRef.current = true;
    async function fetchScore() {
      try {
        const response = await databases.getDocument({
          databaseId: process.env.NEXT_PUBLIC_DATABASE!,
          collectionId: process.env.NEXT_PUBLIC_SCORES_COLLECTION!,
          documentId: id,
        });
        log.debug(`Score data received:`, {
          id: response.$id,
          title: response.name,
        });
        setScore(response as unknown as MusicScore);
      } catch (error) {
        log.error("Error fetching score:", error);
      }
    }
    if (id) void fetchScore();
  }, [id, router, score.$id]);
  useEffect(() => {
    if (!score?.$id || !score.notes_id || scoreNotes || !noteListType) {
      log.debug(
        "Skipping score notes fetch due to missing score scores or notes",
      );
      return;
    }
    const fetchScoreNotes = async () => {
      try {
        log.debug(
          `Fetching notes for score ID: ${score.$id}, notes_id: ${score.notes_id}`,
        );
        const url = storage.getFileDownload({
          bucketId: process.env.NEXT_PUBLIC_FILES_BUCKET!,
          fileId: score.notes_id!,
        });
        log.debug("note list type: ", noteListType);

        const response = await api.get(url, { responseType: "arraybuffer" });
        const buffer = response.data;
        log.debug(
          `Received score notes buffer of size: ${buffer.byteLength} bytes`,
        );
        const dataView = new Uint8Array(buffer);
        const notes = noteListType.decode(dataView) as NoteList;
        log.debug(
          `Successfully decoded score notes with ${
            notes.notes?.length || 0
          } notes`,
        );
        setScoreNotes(notes);
        log.debug("Score notes:", notes);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          log.error(
            `Failed to fetch score notes: ${error.response?.status} ${error.response?.statusText}`,
          );
        } else {
          log.error("Error fetching score notes:", error);
        }
      }
    };
    void fetchScoreNotes();
  }, [score?.$id, score?.notes_id, scoreNotes, noteListType]);
  const filteredEditList = useMemo(() => {
    if (!editList) return null;
    const obj: ScoringResult = editList as ScoringResult;
    return {
      ...obj,
      edits:
        obj.edits?.filter(
          (e: Edit) => (e.sChar?.confidence ?? 5) >= confidenceThreshold,
        ) ?? [],
    } as ScoringResult;
  }, [editList, confidenceThreshold]);
  const variance = editList?.unstableRate ?? 0;
  const accuracy = useMemo(() => {
    if (!filteredEditList || !scoreNotes) return 100;
    const numEdits = filteredEditList.edits?.length || 0;
    const total = scoreNotes.notes?.length || 1;
    return ((1 - numEdits / total) * 100).toFixed(1);
  }, [filteredEditList, scoreNotes]);
  useEffect(() => {
    if (!filteredEditList) return;
    const cnt =
      filteredEditList.edits?.filter((e: Edit) => e.sChar?.page === currentPage)
        .length || 0;
    setEditsOnPage(cnt);
  }, [filteredEditList, currentPage]);
  function NavContent() {
    return (
      <div className="flex items-center text-xl gap-4">
        <Link href="/app" className="text-muted-foreground flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="flex-1 flex items-baseline gap-2 overflow-hidden">
          <span className="truncate whitespace-nowrap overflow-ellipsis max-w-xl">
            {score.name}
          </span>
          {score.subtitle && (
            <span className="text-gray-500 dark:text-gray-400 truncate whitespace-nowrap max-w-xs">
              {score.subtitle}
            </span>
          )}
        </div>
      </div>
    );
  }
  const isMxml = score.mime_type.includes("musicxml");
  useEditDisplayMusicXML(
    filteredEditList,
    scoreNotes,
    id,
    score.file_id,
    setEditsOnPage,
    isMxml,
  );
  useEditDisplay(
    filteredEditList,
    scoreNotes,
    score.file_id,
    !isMxml,
    canvasWrappers,
    confidenceThreshold,
  );
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      recordingCompatible === null &&
      (!inputType || inputType === "audio")
    ) {
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !(
          window as unknown as {
            MSStream?: unknown;
          }
        ).MSStream;
      const isIOSChrome = isIOS && navigator.userAgent.includes("CriOS");
      const isIOSFirefox = isIOS && navigator.userAgent.includes("FxiOS");
      if (isIOS && (isIOSChrome || isIOSFirefox)) {
        setRecordingCompatible(false);
        if (!hasShownCompatibilityToast.current) {
          hasShownCompatibilityToast.current = true;
          setTimeout(() => {
            addToast({
              title: "Browser Not Supported",
              description:
                "Recording in Chrome or Firefox on iOS is not supported. Please use Safari instead.",
              type: "info",
              duration: 8000,
            });
          }, 100);
        }
      } else if (!navigator.mediaDevices) {
        setRecordingCompatible(false);
        if (isIOS && !hasShownCompatibilityToast.current) {
          hasShownCompatibilityToast.current = true;
          setTimeout(() => {
            addToast({
              title: "Microphone Access Required",
              description:
                "On iOS, recording requires microphone permission. Try opening this page directly in Safari.",
              type: "info",
              duration: 8000,
            });
          }, 100);
        }
      } else {
        setRecordingCompatible(true);
      }
    }
  }, [isClient, inputType, recordingCompatible]);
  const toggleRecording = () => {
    if (!inputType) {
      setIsInputModalOpen(true);
      return;
    }
    if (inputType === "audio") {
      if (!score.notes_id) {
        addToast({
          title: "Score Not Ready",
          description: "Reference notes are unavailable for this score.",
          type: "error",
        });
        return;
      }
      if (recordingCompatible === false) {
        showRecordingHelp();
        return;
      }
      log.debug(isRecording ? "Stopping recording" : "Starting recording");
      setIsRecording((prev) => !prev);
      return;
    }
    if (manualSubmittingRef.current) {
      return;
    }
    if (!isRecording) {
      log.debug("Starting manual capture session");
      startManualRecording();
    } else {
      log.debug("Stopping manual capture session");
      void finishManualRecording();
    }
  };
  const handleInputTypeSelect = useCallback((type: ScoreInputType) => {
    setInputType(type);
    if (typeof window !== "undefined") {
      localStorage.setItem("score.inputType", type);
    }
    setIsInputModalOpen(false);
  }, []);
  const handleInputModalClose = useCallback(() => {
    if (!inputType) {
      setIsInputModalOpen(true);
      return;
    }
    setIsInputModalOpen(false);
  }, [inputType]);
  const toggleMidiSound = useCallback(() => {
    const next = !midiSoundEnabled;
    setMidiSoundEnabled(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("score.midiSound", String(next));
    }
  }, [midiSoundEnabled]);
  const {
    triggerAttack,
    triggerRelease,
    ready: pianoReady,
  } = usePiano(
    inputType === "keyboard" || (inputType === "midi" && midiSoundEnabled),
  );
  const handleManualNoteOn = useCallback(
    (midi: number, velocity = 0.9) => {
      const limitedVelocity = clampVelocity(velocity);
      const shouldPlay =
        inputType === "keyboard" || (inputType === "midi" && midiSoundEnabled);
      if (shouldPlay) {
        void triggerAttack(midi, limitedVelocity);
      }
      if (
        !isRecording ||
        inputType === "audio" ||
        recordingStartRef.current === null
      ) {
        return;
      }
      const start = recordingStartRef.current;
      const startOffset = (performance.now() - start) / 1000;
      manualActiveNotesRef.current.set(midi, {
        start: startOffset,
        velocity: limitedVelocity,
      });
    },
    [inputType, isRecording, midiSoundEnabled, triggerAttack],
  );
  const handleManualNoteOff = useCallback(
    (midi: number) => {
      const shouldPlay =
        inputType === "keyboard" || (inputType === "midi" && midiSoundEnabled);
      if (shouldPlay) {
        triggerRelease(midi);
      }
      const active = manualActiveNotesRef.current.get(midi);
      if (!active || recordingStartRef.current === null) {
        return;
      }
      const now = performance.now();
      const duration = Math.max(
        0.05,
        (now - recordingStartRef.current) / 1000 - active.start,
      );
      manualNotesRef.current.push({
        midi,
        start: active.start,
        duration,
        velocity: active.velocity,
      });
      manualActiveNotesRef.current.delete(midi);
    },
    [inputType, midiSoundEnabled, triggerRelease],
  );
  const midiStatus = useMidiInput(
    inputType === "midi",
    handleManualNoteOn,
    handleManualNoteOff,
  );
  const finalizeActiveNotes = useCallback(() => {
    if (recordingStartRef.current === null) return;
    const sessionStart = recordingStartRef.current;
    const shouldPlay =
      inputType === "keyboard" || (inputType === "midi" && midiSoundEnabled);
    const now = performance.now();
    manualActiveNotesRef.current.forEach((note, midi) => {
      const duration = Math.max(0.05, (now - sessionStart) / 1000 - note.start);
      manualNotesRef.current.push({
        midi,
        start: note.start,
        duration,
        velocity: note.velocity,
      });
      if (shouldPlay) {
        triggerRelease(midi);
      }
    });
    manualActiveNotesRef.current.clear();
  }, [inputType, midiSoundEnabled, triggerRelease]);
  const startManualRecording = useCallback(() => {
    if (manualSubmittingRef.current) {
      return;
    }
    if (!score.notes_id) {
      addToast({
        title: "Score Not Ready",
        description: "Reference notes are unavailable for this score.",
        type: "error",
      });
      return;
    }
    if (inputType === "midi" && midiStatus.error) {
      addToast({
        title: "MIDI Unavailable",
        description: midiStatus.error,
        type: "error",
      });
      return;
    }
    if (inputType === "midi" && !midiStatus.ready) {
      addToast({
        title: "Waiting for MIDI",
        description:
          "Connect and authorize a MIDI controller to capture notes.",
        type: "info",
      });
    }
    manualActiveNotesRef.current.clear();
    manualNotesRef.current = [];
    recordingStartRef.current = performance.now();
    manualSubmittingRef.current = false;
    setIsRecording(true);
  }, [addToast, inputType, midiStatus.error, midiStatus.ready, score.notes_id]);
  const finishManualRecording = useCallback(async () => {
    if (manualSubmittingRef.current) return;
    manualSubmittingRef.current = true;
    setIsRecording(false);
    finalizeActiveNotes();
    const captured = [...manualNotesRef.current];
    manualActiveNotesRef.current.clear();
    if (!score.notes_id) {
      addToast({
        title: "Score Not Ready",
        description: "Reference notes are unavailable for this score.",
        type: "error",
      });
      manualNotesRef.current = [];
      recordingStartRef.current = null;
      manualSubmittingRef.current = false;
      return;
    }
    if (captured.length === 0) {
      addToast({
        title: "No Notes Captured",
        description: "Record at least one note before stopping.",
        type: "info",
      });
      manualNotesRef.current = [];
      recordingStartRef.current = null;
      manualSubmittingRef.current = false;
      return;
    }
    try {
      let noteType = noteListType;
      let recordingTypeLocal = recordingType;
      if (!noteType || !recordingTypeLocal) {
        const types = await refetchTypes();
        noteType = types.NoteListType;
        recordingTypeLocal = types.RecordingType;
      }
      if (!noteType || !recordingTypeLocal) {
        throw new Error("Protobuf types unavailable");
      }
      const sorted = [...captured].sort((a, b) => a.start - b.start);
      const pageSizes = scoreNotes?.size ? [...scoreNotes.size] : [];
      const noteListPayload = noteType.create({
        notes: sorted.map((note, index) => ({
          pitch: note.midi,
          startTime: note.start,
          duration: note.duration,
          velocity: note.velocity,
          page: currentPage,
          track: 0,
          bbox: [],
          confidence: 1,
          id: index,
        })),
        size: pageSizes,
        voices: [],
        lines: [],
      }) as NoteList;
      const encoded = noteType.encode(noteListPayload).finish();
      const payloadBuffer =
        encoded.byteOffset === 0 &&
        encoded.byteLength === encoded.buffer.byteLength
          ? encoded.buffer
          : encoded.buffer.slice(
              encoded.byteOffset,
              encoded.byteOffset + encoded.byteLength,
            );
      const response = await api.post("/score/receive-notes", payloadBuffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Score-ID": id,
          "X-Notes-ID": score.notes_id || "",
          "X-Focused-Page": currentPage.toString(),
        },
        responseType: "arraybuffer",
      });
      const buffer = response.data as ArrayBuffer;
      const recordingMessage = recordingTypeLocal.decode(
        new Uint8Array(buffer),
      ) as Recording;
      const recordingObject = recordingTypeLocal.toObject(recordingMessage, {
        defaults: true,
        enums: String,
        longs: Number,
      }) as Recording;
      const edits = recordingObject.computedEdits;
      log.debug("recording:", recordingObject);
      setEditList(edits ?? null);
      setTimeout(() => {
        document.dispatchEvent(
          new CustomEvent("score:redrawAnnotations", { bubbles: true }),
        );
      }, 50);
      addToast({
        title: "Recording Processed",
        description: "Manual input compared against the score.",
        type: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Manual capture failed", error);
      addToast({
        title: "Capture Failed",
        description: message,
        type: "error",
      });
    } finally {
      manualNotesRef.current = [];
      recordingStartRef.current = null;
      manualSubmittingRef.current = false;
    }
  }, [
    addToast,
    currentPage,
    finalizeActiveNotes,
    id,
    noteListType,
    recordingType,
    refetchTypes,
    score.notes_id,
    scoreNotes,
  ]);
  useEffect(() => {
    if (!isClient) {
      return;
    }
    const debugWindow = window as Window;
    if (!isDebugMode) {
      delete debugWindow.__manualCaptureStart;
      delete debugWindow.__manualCaptureStop;
      delete debugWindow.__manualNoteOn;
      delete debugWindow.__manualNoteOff;
      return;
    }
    debugWindow.__manualCaptureStart = () => {
      startManualRecording();
    };
    debugWindow.__manualCaptureStop = () => finishManualRecording();
    debugWindow.__manualNoteOn = (midi: number, velocity = 0.9) =>
      handleManualNoteOn(midi, velocity);
    debugWindow.__manualNoteOff = (midi: number) => handleManualNoteOff(midi);
    return () => {
      delete debugWindow.__manualCaptureStart;
      delete debugWindow.__manualCaptureStop;
      delete debugWindow.__manualNoteOn;
      delete debugWindow.__manualNoteOff;
    };
  }, [
    finishManualRecording,
    handleManualNoteOff,
    handleManualNoteOn,
    isClient,
    isDebugMode,
    startManualRecording,
  ]);
  useEffect(() => {
    if (inputType !== "midi") {
      lastMidiError.current = null;
      return;
    }
    if (midiStatus.error && midiStatus.error !== lastMidiError.current) {
      lastMidiError.current = midiStatus.error;
      addToast({
        title: "MIDI Error",
        description: midiStatus.error,
        type: "error",
      });
    }
    if (!midiStatus.error) {
      lastMidiError.current = null;
    }
  }, [addToast, inputType, midiStatus.error]);
  useEffect(() => {
    setIsRecording(false);
    manualActiveNotesRef.current.clear();
    manualNotesRef.current = [];
    recordingStartRef.current = null;
    manualSubmittingRef.current = false;
  }, [inputType]);
  const showRecordingHelp = () => {
    if (hasShownCompatibilityToast.current) {
      return;
    }
    hasShownCompatibilityToast.current = true;
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(
        window as unknown as {
          MSStream?: unknown;
        }
      ).MSStream;
    setTimeout(() => {
      if (isIOS) {
        addToast({
          title: "iOS Recording Requirements",
          description:
            "Recording requires Safari browser. Please open this page directly in Safari, not from within apps like Instagram or Facebook.",
          type: "info",
          duration: 8000,
        });
      } else {
        addToast({
          title: "Recording Not Supported",
          description:
            "Your browser does not support recording. Please try a different browser like Chrome or Safari.",
          type: "info",
          duration: 5000,
        });
      }
    }, 100);
  };
  const [lastStarTime, setLastStarTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRecordingsModal, setShowRecordingsModal] = useState(false);
  const [showMetricsPanel, setShowMetricsPanel] = useState(false);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const recenterButton = useRef<HTMLButtonElement>(null);
  const fetchedDataRef = useRef<boolean>(false);
  useEffect(() => {
    if (!scoringResultType) {
      log.warn("ScoringResultType is not yet initialized");
      return;
    }
    log.debug("ScoringResultType is initialized and ready to use");
  }, [scoringResultType]);
  const onStarToggle = (score: MusicScore) => {
    setLastStarTime(Date.now());
    if (Date.now() - lastStarTime < 700) return;
    setScore({ ...score, starred: !score.starred });
    databases
      .updateDocument({
        databaseId: process.env.NEXT_PUBLIC_DATABASE!,
        collectionId: process.env.NEXT_PUBLIC_SCORES_COLLECTION!,
        documentId: score.$id,
        data: { starred_users: [] },
      })
      .catch(log.error);
  };
  const { data: loadedScore, refetch } = useQuery({
    queryKey: ["score_" + id],
    queryFn: async () => {
      if (fetchedDataRef.current || score.$id) {
        log.debug(
          "Preventing duplicate score scores fetch - using existing scores",
        );
        return score.$id ? score : null;
      }
      fetchedDataRef.current = true;
      log.debug(`React Query fetching score data for ID: ${id}`);
      try {
        const response = await databases.getDocument({
          databaseId: process.env.NEXT_PUBLIC_DATABASE!,
          collectionId: process.env.NEXT_PUBLIC_SCORES_COLLECTION!,
          documentId: id,
        });
        return response as unknown as MusicScore;
      } catch (error) {
        log.error("Error in React Query fetch:", error);
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          log.error(`Score with ID ${id} not found`);
        }
        return null;
      }
    },
    staleTime: 7 * 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });
  useEffect(() => {
    if (!loadedScore) return;
    log.debug(`Setting score from React Query data: ${loadedScore.$id}`);
    setScore(loadedScore);
  }, [loadedScore]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const fullscreenParam = url.searchParams.get("fullscreen");
      if (fullscreenParam === "true") {
        setIsFullscreen(true);
      }
    }
  }, []);
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      void document.documentElement.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };
  useEffect(() => {
    const handlePageInfo = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { totalPages, scoreId } = customEvent.detail;
      if (scoreId === id || scoreId === score.file_id) {
        setTotalPages(totalPages);
        setScore((prevScore) => ({
          ...prevScore,
          total_pages: totalPages,
        }));
      }
    };
    document.addEventListener("score:pageInfo", handlePageInfo);
    return () => {
      document.removeEventListener("score:pageInfo", handlePageInfo);
    };
  }, [id, score.file_id]);
  const goToPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    } else if (currentPage === 0) {
      toggleFullscreen();
    }
  };
  const goToNextPage = () => {
    if (totalPages && currentPage >= totalPages - 1) {
      return;
    }
    setCurrentPage(currentPage + 1);
  };
  useEffect(() => {
    document.documentElement.style.overscrollBehaviorX = "none";
    document.body.style.overscrollBehaviorX = "none";
  }, []);
  const ControlDock = () => {
    const currentDisplayPage = currentPage + 1;
    const totalPages = score && score.total_pages ? score.total_pages : "?";
    const [isSmallScreen, setIsSmallScreen] = useState(false);
    const InputTypeIcon =
      inputType === "keyboard" ? Piano : inputType === "midi" ? Cable : Mic;
    const inputLabel = inputType ?? "select";
    const isAudioMode = inputType === "audio";
    const showMidiControls = inputType === "midi";
    const MidiSoundIcon = midiSoundEnabled ? Volume2 : VolumeX;
    const midiSoundTooltip = midiSoundEnabled
      ? "Mute MIDI playback"
      : "Enable MIDI playback";
    const manualBusy = manualSubmittingRef.current;
    const recordTooltip = (() => {
      if (manualBusy) return "Processing capture…";
      if (!inputType) return "Select input type first";
      if (isAudioMode) {
        if (recordingCompatible === false) {
          return "Recording not supported in this browser";
        }
        return isRecording ? "Stop recording" : "Start recording";
      }
      if (inputType === "keyboard") {
        return isRecording ? "Stop keyboard capture" : "Start keyboard capture";
      }
      return isRecording ? "Stop MIDI capture" : "Start MIDI capture";
    })();
    const recordButtonClass = isRecording
      ? "bg-red-600"
      : isAudioMode
        ? recordingCompatible === false
          ? "bg-amber-600"
          : "bg-primary"
        : "bg-primary";
    const isAudioBlocked = isAudioMode && recordingCompatible === false;
    const disableRecordButton = isAudioBlocked || manualBusy;
    const IdleRecordIcon = isAudioBlocked ? AlertTriangle : InputTypeIcon;
    useEffect(() => {
      const checkScreenSize = () => {
        setIsSmallScreen(window.innerWidth < 500);
      };
      checkScreenSize();
      window.addEventListener("resize", checkScreenSize);
      return () => window.removeEventListener("resize", checkScreenSize);
    }, []);
    return (
      <div
        ref={dockRef}
        className="absolute right-0 bottom-0 w-full border-t border-gray-200 dark:border-gray-700 transition-opacity duration-300"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] bg-gray-100 dark:bg-gray-850 px-4 py-2">
          <div className="flex items-center gap-4 justify-self-start">
            <BasicTooltip text={recordTooltip}>
              <Button
                onClick={
                  disableRecordButton ? showRecordingHelp : toggleRecording
                }
                className={`${recordButtonClass} text-white ${
                  isSmallScreen ? "w-10 h-10" : "w-14 h-14"
                } rounded-full flex items-center justify-center`}
                disabled={disableRecordButton}
              >
                {isRecording ? (
                  <SquareIcon
                    className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                  />
                ) : (
                  <IdleRecordIcon
                    className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                  />
                )}
              </Button>
            </BasicTooltip>
            <BasicTooltip text="View previous recordings">
              <Button
                onClick={() => setShowRecordingsModal(!showRecordingsModal)}
                variant="ghost"
                size="icon"
                className="text-gray-900 dark:text-white"
              >
                <Clock className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`} />
              </Button>
            </BasicTooltip>
            <div className="flex items-center gap-2">
              <BasicTooltip text="Metrics">
                <Button
                  onClick={() => setShowMetricsPanel(!showMetricsPanel)}
                  variant="ghost"
                  size="icon"
                  className="text-gray-900 dark:text-white"
                >
                  <BarChart2
                    className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                  />
                </Button>
              </BasicTooltip>
              <div className="text-xl text-gray-500 dark:text-gray-400">
                {accuracy}% / {variance.toFixed(0)} VAR
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-self-center">
            <BasicTooltip text="Previous page">
              <Button
                onClick={goToPrevPage}
                variant="ghost"
                size="icon"
                className="text-gray-900 dark:text-white"
                disabled={currentPage <= 0}
                data-testid="btn-prev-page"
              >
                <ArrowLeftCircle
                  className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                />
              </Button>
            </BasicTooltip>
            <div
              className={`${
                isSmallScreen ? "px-1 text-sm" : "px-4"
              } text-gray-900 dark:text-white font-medium whitespace-nowrap`}
            >
              {currentDisplayPage} / {totalPages}
            </div>
            <BasicTooltip text="Next page">
              <Button
                onClick={goToNextPage}
                variant="ghost"
                size="icon"
                className="text-gray-900 dark:text-white"
                data-testid="btn-next-page"
              >
                <ArrowRightCircle
                  className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                />
              </Button>
            </BasicTooltip>
            <BasicTooltip text="Zoom out">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  document.dispatchEvent(
                    new CustomEvent("score:zoomOut", { bubbles: true }),
                  )
                }
                className="text-gray-900 dark:text-white"
                data-testid="btn-zoom-out"
              >
                <ZoomOut
                  className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                />
              </Button>
            </BasicTooltip>
            <BasicTooltip text="Zoom in">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  document.dispatchEvent(
                    new CustomEvent("score:zoomIn", { bubbles: true }),
                  )
                }
                className="text-gray-900 dark:text-white"
                data-testid="btn-zoom-in"
              >
                <ZoomIn
                  className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                />
              </Button>
            </BasicTooltip>
            <BasicTooltip text="Reset zoom">
              <Button
                variant="ghost"
                size="icon"
                ref={recenterButton}
                onClick={() =>
                  document.dispatchEvent(
                    new CustomEvent("score:zoomReset", { bubbles: true }),
                  )
                }
                className="text-gray-900 dark:text-white"
                data-testid="btn-zoom-reset"
              >
                <Fullscreen
                  className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                />
              </Button>
            </BasicTooltip>
          </div>

          <div className="flex items-center gap-6 justify-self-end">
            <BasicTooltip text="Change input type">
              <Button
                onClick={() => setIsInputModalOpen(true)}
                variant="outline"
                size="default"
                className="flex items-center gap-2 rounded-full bg-white/80 dark:bg-gray-800/80 text-gray-900 dark:text-white border-gray-300 dark:border-gray-700"
              >
                <InputTypeIcon className="h-4 w-4" />
                <span className="text-sm font-medium capitalize">
                  {inputLabel}
                </span>
              </Button>
            </BasicTooltip>
            {showMidiControls && (
              <div className="flex items-center gap-2">
                <BasicTooltip text={midiSoundTooltip}>
                  <Button
                    onClick={toggleMidiSound}
                    variant="outline"
                    size="icon"
                    className="rounded-full bg-white/80 dark:bg-gray-800/80 text-gray-900 dark:text-white border-gray-300 dark:border-gray-700"
                    disabled={!midiStatus.ready}
                  >
                    <MidiSoundIcon
                      className={`${isSmallScreen ? "h-4 w-4" : "h-5 w-5"}`}
                    />
                  </Button>
                </BasicTooltip>
                {midiStatus.deviceName && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[140px] truncate">
                    {midiStatus.deviceName}
                  </span>
                )}
              </div>
            )}
            <BasicTooltip
              text={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="text-gray-900 dark:text-white"
              >
                {isFullscreen ? (
                  <Minimize2
                    className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                  />
                ) : (
                  <Maximize2
                    className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                  />
                )}
              </Button>
            </BasicTooltip>
            <BasicTooltip text="Download">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  window.open(
                    storage.getFileDownload({
                      bucketId: process.env.NEXT_PUBLIC_SCORES_BUCKET!,
                      fileId: score.file_id!,
                    }),
                  )
                }
                className="text-gray-900 dark:text-white"
              >
                <Download
                  className={`${isSmallScreen ? "h-4 w-4" : "h-5 w-5"}`}
                />
              </Button>
            </BasicTooltip>
            <BasicTooltip text="Star">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onStarToggle(score)}
                className="text-gray-900 dark:text-white"
              >
                <Star
                  className={`${isSmallScreen ? "h-4 w-4" : "h-5 w-5"} ${
                    score.starred ? "text-yellow-400 fill-yellow-400" : ""
                  }`}
                />
              </Button>
            </BasicTooltip>
          </div>
        </div>

        {showRecordingsModal && (
          <RecordingsModal
            open={showRecordingsModal}
            onClose={() => setShowRecordingsModal(false)}
            scoreId={id}
            onLoad={(buf) => {
              if (!recordingType) return;
              const decoded = recordingType.decode(
                new Uint8Array(buf),
              ) as Recording;
              const edits = JSON.parse(
                JSON.stringify(decoded.computedEdits),
              ) as ScoringResult;
              setEditList(edits);
            }}
          />
        )}
      </div>
    );
  };
  return (
    <Layout navbarContent={<NavContent />}>
      <div className="relative h-[calc(100vh-4rem)]">
        <div className="h-[calc(100%-4rem)] w-full relative overflow-y-auto">
          {score && score.$id && score.file_id ? (
            score.mime_type.includes("musicxml") ? (
              <MusicXMLRenderer
                recenter={recenterButton}
                scoreId={score.file_id}
                retry={() => {
                  log.debug(
                    "Retry requested for MusicXMLRenderer, limiting frequency",
                  );
                  if (
                    window.lastRefetchTime &&
                    Date.now() - window.lastRefetchTime < 5000
                  ) {
                    log.debug("Skipping refetch due to rate limiting");
                    return;
                  }
                  window.lastRefetchTime = Date.now();
                  void refetch();
                }}
              />
            ) : (
              <ImageScoreRenderer
                scoreId={score.file_id}
                recenter={recenterButton}
                retry={() => {
                  log.debug(
                    "Retry requested for ImageScoreRenderer, limiting frequency",
                  );
                  if (
                    window.lastRefetchTime &&
                    Date.now() - window.lastRefetchTime < 5000
                  ) {
                    log.debug("Skipping refetch due to rate limiting");
                    return;
                  }
                  window.lastRefetchTime = Date.now();
                  void refetch();
                }}
                currentPage={currentPage}
                pagesPerView={1}
                displayMode={displayMode}
                verticalLoading={verticalLoading}
                editList={filteredEditList}
                setPage={setCurrentPage}
                confidenceFilter={confidenceThreshold}
                onCanvasWrappersChange={updateCanvasWrappers}
              />
            )
          ) : (
            ""
          )}
        </div>

        <ControlDock />

        {inputType === "keyboard" && (
          <KeyboardPanel
            onNoteOn={handleManualNoteOn}
            onNoteOff={handleManualNoteOff}
            ready={pianoReady}
            disabled={!pianoReady}
          />
        )}

        <InputTypeModal
          open={isInputModalOpen}
          onClose={handleInputModalClose}
          onSelect={handleInputTypeSelect}
          current={inputType}
        />

        {isClient && isDebugMode && (
          <DebugPanel
            scoreId={score.file_id}
            editList={filteredEditList}
            setEditList={setEditList}
            currentPage={currentPage}
            editsOnPage={editsOnPage}
            confidenceFilter={confidenceThreshold}
            setConfidenceFilter={setConfidenceThreshold}
          />
        )}
      </div>
    </Layout>
  );
}
