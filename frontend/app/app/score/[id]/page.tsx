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
  Clock,
  Download,
  Fullscreen,
  Maximize2,
  Mic,
  Minimize2,
  SquareIcon,
  Star,
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
import { Edit, NoteList, ScoringResult } from "@/types/proto-types";

import { useToast } from "@/components/ui/toast";
import { databases, storage } from "@/lib/appwrite";
import { initProtobufTypes, protobufTypeCache } from "@/lib/proto";
import DebugPanel from "@/components/DebugPanel";
import api from "@/lib/network";
import RecordingsModal from "@/components/RecordingsModal";
import { type RecordingError, useAudioRecorder } from "@/lib/audio-recorder";
import { MusicScore } from "@/types/score-types";
import { useEditDisplay } from "@/lib/edit-display";

// Add a global type declaration to prevent TypeScript errors
declare global {
  // noinspection JSUnusedGlobalSymbols
  interface Window {
    lastRefetchTime?: number;
  }
}

export default function ScorePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
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
    total_pages: 1,
  });
  const [editList, setEditList] = useState<ScoringResult | null>(null);
  const [playedNotes, setPlayedNotes] = useState<NoteList | null>(null);
  const [scoreNotes, setScoreNotes] = useState<NoteList | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [displayMode, setDisplayMode] = useState<"paged" | "scroll">("paged");
  const [verticalLoading, setVerticalLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false); // Default false for server rendering
  const [editsOnPage, setEditsOnPage] = useState(0);
  const [isClient, setIsClient] = useState(false); // Track if we're on client side
  const [confidenceThreshold, setConfidenceThreshold] = useState(3);
  const { addToast } = useToast(); // Use the toast context
  const [recordingCompatible, setRecordingCompatible] = useState<
    boolean | null
  >(null);
  const hasShownCompatibilityToast = useRef(false);

  // Use effect to detect client side rendering and initialize debug mode
  useEffect(() => {
    setIsClient(true);
    // Initialize debug mode from localStorage only on client
    setIsDebugMode(!!localStorage.getItem("debug"));

    // Initialize display mode from localStorage
    setDisplayMode(
      localStorage.getItem("score.displayAllPages") === "true"
        ? "scroll"
        : "paged",
    );
    setVerticalLoading(localStorage.getItem("score.verticalLoad") === "true");

    // Add storage event listener for debug mode toggle
    const handleStorageChange = () => {
      const debugEnabled = !!localStorage.getItem("debug");
      setIsDebugMode(debugEnabled);
      setDisplayMode(
        localStorage.getItem("score.displayAllPages") === "true"
          ? "scroll"
          : "paged",
      );
      setVerticalLoading(localStorage.getItem("score.verticalLoad") === "true");
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // State to track protobuf type initialization
  const [scoringResultType, setScoringResultType] = useState<Type | null>(
    protobufTypeCache.ScoringResultType,
  );
  const [noteListType, setNoteListType] = useState<Type | null>(
    protobufTypeCache.NoteListType,
  );

  // Function to refetch protobuf types
  const refetchTypes = async () => {
    const result = await initProtobufTypes();
    setScoringResultType(result.ScoringResultType);
    setNoteListType(result.NoteListType);
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

  // Initialize protobuf types on component mount if not already initialized
  useEffect(() => {
    if (!protobufTypeCache.initialized && !protobufTypeCache.initializing)
      void refetchTypes();
  }, []);

  useAudioRecorder({
    isRecording,
    ScoringResultType: scoringResultType,
    NoteListType: noteListType,
    scoreId: id,
    notesId: score.notes_id || "",
    refetchTypes,
    onEditListChange: setEditList,
    onPlayedNotesChange: setPlayedNotes,
    onError: handleRecordingError,
  });

  // Fetch the score scores
  useEffect(() => {
    // Skip fetch if we already have scores or are using React Query
    if (score.$id || fetchedDataRef.current) {
      return;
    }

    log.debug(`Fetching score data for ID: ${id}`);
    fetchedDataRef.current = true;

    async function fetchScore() {
      try {
        const response = await databases.getDocument(
          process.env.NEXT_PUBLIC_DATABASE!,
          process.env.NEXT_PUBLIC_SCORES_COLLECTION!,
          id,
        );
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

  // Fetch score notes when score is loaded
  useEffect(() => {
    // Skip if we don't have the score scores yet or already have notes
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
        const url = storage.getFileDownload(
          process.env.NEXT_PUBLIC_FILES_BUCKET!,
          score.notes_id!,
        );
        const response = await api.get(url, { responseType: "arraybuffer" });
        const buffer = response.data;
        log.debug(
          `Received score notes buffer of size: ${buffer.byteLength} bytes`,
        );

        // Decode the notes
        const dataView = new Uint8Array(buffer);
        const notes = noteListType.decode(dataView) as NoteList;

        log.debug(
          `Successfully decoded score notes with ${
            notes.notes?.length || 0
          } notes`,
        );
        setScoreNotes(notes);
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

  const unstableRate = editList?.unstableRate ?? 0;
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

  // Use the edit display hook
  useEditDisplay(
    filteredEditList,
    scoreNotes,
    currentPage,
    id,
    score.file_id,
    setEditsOnPage,
  );

  // Check for recording compatibility on component mount
  useEffect(() => {
    // Only run once when the component is mounted on the client
    if (typeof window !== "undefined" && recordingCompatible === null) {
      // Check for iOS and Safari
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !(window as unknown as { MSStream?: unknown }).MSStream;
      const isIOSChrome = isIOS && navigator.userAgent.includes("CriOS");
      const isIOSFirefox = isIOS && navigator.userAgent.includes("FxiOS");

      // iOS devices should use Safari
      if (isIOS && (isIOSChrome || isIOSFirefox)) {
        setRecordingCompatible(false);
        // Only show toast once to prevent infinite loop
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
        // Only show a toast if we're on iOS, as this is a known limitation
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
    // Removing addToast from dependencies to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]);

  // Handle recording errors with more detail
  // Initialize the hook without pulling out start/stop

  const toggleRecording = () => {
    log.debug(isRecording ? "Stopping recording" : "Starting recording");
    setIsRecording((prev) => !prev);
  };

  // Function to show recording help toast
  const showRecordingHelp = () => {
    // Don't show toast if we've already shown one to prevent render loops
    if (hasShownCompatibilityToast.current) {
      return;
    }

    hasShownCompatibilityToast.current = true;
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;

    // Use setTimeout to break potential render loops
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
  const fetchedDataRef = useRef<boolean>(false); // Prevent duplicate API calls during React's double-render

  // Log when protobuf types are initialized
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
      .updateDocument(
        process.env.NEXT_PUBLIC_DATABASE!,
        process.env.NEXT_PUBLIC_SCORES_COLLECTION!,
        score.$id,
        { starred_users: [] },
      )
      .catch(log.error);
  };

  const { data: loadedScore, refetch } = useQuery({
    queryKey: ["score_" + id],
    queryFn: async () => {
      // Prevent duplicate API calls during StrictMode's double-render or if we already have scores
      if (fetchedDataRef.current || score.$id) {
        log.debug(
          "Preventing duplicate score scores fetch - using existing scores",
        );
        return score.$id ? score : null;
      }

      // Mark that we've started a fetch
      fetchedDataRef.current = true;
      log.debug(`React Query fetching score data for ID: ${id}`);

      try {
        const response = await databases.getDocument(
          process.env.NEXT_PUBLIC_DATABASE!,
          process.env.NEXT_PUBLIC_SCORES_COLLECTION!,
          id,
        );
        return response as unknown as MusicScore;
      } catch (error) {
        log.error("Error in React Query fetch:", error);
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          log.error(`Score with ID ${id} not found`);
        }
        return null;
      }
    },
    staleTime: 7 * 24 * 60 * 60 * 1000, // Consider scores fresh for 1 week
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

  // Get total pages information from score renderers
  useEffect(() => {
    const handlePageInfo = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { totalPages, scoreId } = customEvent.detail;

      if (scoreId === id || scoreId === score.file_id) {
        setTotalPages(totalPages);
        // Update score object with totalPages
        setScore((prevScore) => ({
          ...prevScore,
          total_pages: totalPages,
        }));
      }
    };

    // Listen for page info events
    document.addEventListener("score:pageInfo", handlePageInfo);

    return () => {
      document.removeEventListener("score:pageInfo", handlePageInfo);
    };
  }, [id, score.file_id]);

  // Navigation functions for page turning
  const goToPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    } else if (currentPage === 0) {
      // If on first page, toggle fullscreen mode
      toggleFullscreen();
    }
  };

  const goToNextPage = () => {
    // Only limit next page if we know total pages
    if (totalPages && currentPage >= totalPages - 1) {
      return;
    }
    setCurrentPage(currentPage + 1);
  };

  useEffect(() => {
    // disable chrome two finger swipe gesture
    document.documentElement.style.overscrollBehaviorX = "none";
    document.body.style.overscrollBehaviorX = "none";
  }, []);

  const ControlDock = () => {
    const currentDisplayPage = currentPage + 1;
    const totalPages = score && score.total_pages ? score.total_pages : "?";

    const [isSmallScreen, setIsSmallScreen] = useState(false);

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
            <BasicTooltip
              text={
                recordingCompatible === false
                  ? "Recording not supported in this browser"
                  : isRecording
                    ? "Stop recording"
                    : "Start recording"
              }
            >
              <Button
                onClick={
                  recordingCompatible === false
                    ? showRecordingHelp
                    : toggleRecording
                }
                className={`${
                  isRecording
                    ? "bg-red-600"
                    : recordingCompatible === false
                      ? "bg-amber-600"
                      : "bg-primary"
                } text-white ${
                  isSmallScreen ? "w-10 h-10" : "w-14 h-14"
                } rounded-full flex items-center justify-center`}
                disabled={recordingCompatible === false}
              >
                {isRecording ? (
                  <SquareIcon
                    className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                  />
                ) : recordingCompatible === false ? (
                  <AlertTriangle
                    className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                  />
                ) : (
                  <Mic className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`} />
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
                {accuracy}% / {unstableRate.toFixed(0)} UR
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
              >
                <ArrowRightCircle
                  className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                />
              </Button>
            </BasicTooltip>
            <BasicTooltip text="Reset zoom">
              <Button
                variant="ghost"
                size="icon"
                ref={recenterButton}
                className="text-gray-900 dark:text-white"
              >
                <Fullscreen
                  className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                />
              </Button>
            </BasicTooltip>
          </div>

          <div className="flex items-center gap-6 justify-self-end">
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
                    storage.getFileDownload(
                      process.env.NEXT_PUBLIC_SCORES_BUCKET!,
                      score.file_id!,
                    ),
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
              if (!scoringResultType) return;
              const decoded = scoringResultType.decode(
                new Uint8Array(buf),
              ) as ScoringResult;
              setEditList(decoded);
            }}
          />
        )}
      </div>
    );
  };

  return (
    <Layout navbarContent={<NavContent />}>
      <div className="relative h-[calc(100vh-4rem)]">
        {/* Main score renderer - fills entire screen */}
        <div className="h-[calc(100%-4rem)] w-full relative">
          {score && score.$id && score.file_id ? (
            score.mime_type.includes("musicxml") ? (
              <MusicXMLRenderer
                scoreId={score.file_id}
                retry={() => {
                  log.debug(
                    "Retry requested for MusicXMLRenderer, limiting frequency",
                  );
                  // Debounce the refetch to prevent request spam
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
                  // Debounce the refetch to prevent request spam
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
                setPage={setCurrentPage}
                pagesPerView={1}
                displayMode={displayMode}
                verticalLoading={verticalLoading}
                editList={filteredEditList}
                confidenceFilter={confidenceThreshold}
              />
            )
          ) : (
            ""
          )}
        </div>

        {/* Control dock */}
        <ControlDock />

        {/* Debug panel - only render on client side */}
        {isClient && isDebugMode && (
          <DebugPanel
            scoreId={id}
            editList={filteredEditList}
            setEditList={setEditList}
            playedNotes={playedNotes}
            scoreNotes={scoreNotes}
            currentPage={currentPage}
            editsOnPage={editsOnPage}
            setPlayedNotes={setPlayedNotes}
            confidenceFilter={confidenceThreshold}
            setConfidenceFilter={setConfidenceThreshold}
          />
        )}
      </div>
    </Layout>
  );
}
