"use client";

import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftCircle,
  ArrowRightCircle,
  Clock,
  Download,
  Eye,
  EyeOff,
  Fullscreen,
  Maximize2,
  Mic,
  Minimize2,
  Share2,
  SquareIcon,
  BarChart2,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import MusicXMLRenderer, { MusicScore } from "@/components/music-xml-renderer";
import NotImplementedTooltip from "@/components/ui-custom/not-implemented-tooltip";
import { useQuery } from "@tanstack/react-query";
import BasicTooltip from "@/components/ui-custom/basic-tooltip";
import axios from "axios";
import ImageScoreRenderer from "@/components/image-score-renderer";
import { Message, Type } from "protobufjs";
import log from "@/lib/logger";
import { setupEditEventHandlers, useEditDisplay } from "@/lib/edit-display";
import { RecordingError, useAudioRecorder } from "@/lib/audio-recorder";
import { useToast } from "@/components/ui/toast";
import { databases, storage } from "@/lib/appwrite";
import { initProtobufTypes, protobufTypeCache } from "@/lib/proto";
import DebugPanel from "@/components/DebugPanel";
import api from "@/lib/network";
import RecordingsModal from "@/components/RecordingsModal";

// Add a global type declaration to prevent TypeScript errors
declare global {
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
    $id: "",
    name: "loading",
    subtitle:
      "you're not supposed to be seeing this. if you are, good for you.",
    $createdAt: "",
    total_pages: 1,
  });
  const [editList, setEditList] = useState<Message | null>(null);
  const [playedNotes, setPlayedNotes] = useState<Message | null>(null);
  const [scoreNotes, setScoreNotes] = useState<Message | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
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

    // Add storage event listener for debug mode toggle
    const handleStorageChange = () => {
      const debugEnabled = !!localStorage.getItem("debug");
      setIsDebugMode(debugEnabled);
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

  // Initialize protobuf types on component mount if not already initialized
  useEffect(() => {
    if (!protobufTypeCache.initialized && !protobufTypeCache.initializing) {
      refetchTypes();
    }
  }, []);

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
        router.push("/");
      }
    }

    if (id) {
      fetchScore();
    }
  }, [id, score.$id]);

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
        const notes = noteListType.decode(dataView);

        log.debug(
          `Successfully decoded score notes with ${
            (notes as any).notes?.length || 0
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

    fetchScoreNotes();
  }, [score?.$id, score?.notes_id, scoreNotes, noteListType]);

  const filteredEditList = useMemo(() => {
    if (!editList) return null;
    const obj: any = editList;

    return {
      ...obj,
      edits: obj.edits.filter(
        (e: any) => (e.sChar?.confidence ?? 5) >= confidenceThreshold,
      ),
    };
  }, [editList, confidenceThreshold]);

  const unstableRate = (editList as any)?.unstableRate ?? 0;
  const accuracy = useMemo(() => {
    if (!filteredEditList || !scoreNotes) return 0;
    const numEdits = (filteredEditList as any).edits.length || 0;
    const total = (scoreNotes as any).notes?.length || 1;
    return ((1 - numEdits / total) * 100).toFixed(1);
  }, [filteredEditList, scoreNotes]);

  // Use the edit display hook
  useEditDisplay(
    filteredEditList,
    currentPage,
    id as string,
    setEditsOnPage,
    scoreNotes,
  );

  // Setup event handlers for page changes and annotation redraws
  setupEditEventHandlers(
    id as string,
    score?.file_id,
    setCurrentPage,
    setEditList,
    editList,
    currentPage,
  );

  // Check for recording compatibility on component mount
  useEffect(() => {
    // Only run once when the component is mounted on the client
    if (typeof window !== "undefined" && recordingCompatible === null) {
      // Check for iOS and Safari
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !(window as any).MSStream;
      const isSafari = /^((?!chrome|android).)*safari/i.test(
        navigator.userAgent,
      );
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
  const handleRecordingError = (error: RecordingError) => {
    log.error("Recording error:", error);

    // Reset recording state when an error occurs
    setIsRecording(false);

    // Show error toast with more iOS-specific help
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    if (error.code === "not_supported" && isIOS) {
      addToast({
        title: "Recording Not Available",
        description:
          "On iOS, please use Safari and make sure the site has microphone permissions. Try opening directly from Safari, not from an app.",
        type: "error",
        duration: 8000,
      });
    } else if (error.code === "permission_denied") {
      addToast({
        title: "Microphone Access Denied",
        description:
          "Please allow microphone access to use recording features.",
        type: "error",
        duration: 5000,
      });
    } else {
      addToast({
        title: "Recording Failed",
        description: error.message,
        type: "error",
        duration: 5000,
      });
    }
  };

  // Initialize the hook without pulling out start/stop
  const { hasPermission } = useAudioRecorder({
    isRecording,
    ScoringResultType: scoringResultType,
    NoteListType: noteListType,
    onEditListChange: setEditList,
    onPlayedNotesChange: setPlayedNotes,
    refetchTypes,
    scoreId: id as string,
    notesId: score.notes_id as string,
    onError: handleRecordingError,
  });

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
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

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

  // Page state
  const [lastStarTime, setLastStarTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showDock, setShowDock] = useState(true);
  const [showRecordingsModal, setShowRecordingsModal] = useState(false);
  const [showMetricsPanel, setShowMetricsPanel] = useState(false);
  const [totalPages, setTotalPages] = useState<number | null>(null);

  // Refs
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
          router.push("/");
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

  // Handle fullscreen mode controls visibility
  useEffect(() => {
    // In fullscreen mode, we only auto-hide the top bar now, not the dock
    if (!isFullscreen) {
      setShowControls(true);
      setShowDock(true);
      return;
    }

    const handleMouseMove = () => {
      // Always show the top controls on mouse movement
      setShowControls(true);

      // Clear any existing timeout
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }

      // Set a timeout to hide the top bar (dock stays visible)
      mouseMoveTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    // Handle touch movement to show dock and controls
    const handleTouchMove = (e: TouchEvent) => {
      // Get the touch position
      if (e.touches.length > 0) {
        const touch = e.touches[0];

        // Show controls on any touch
        setShowControls(true);

        // Re-show dock if touch is near the bottom of the screen
        if (!showDock && touch.clientY > window.innerHeight - 150) {
          setShowDock(true);
        }

        // Reset the timeout
        if (mouseMoveTimeoutRef.current) {
          clearTimeout(mouseMoveTimeoutRef.current);
        }

        // Set timeout to hide top controls
        mouseMoveTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };

    // Add listeners for fullscreen mode
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove as EventListener);

    // Initialize timeout for top bar hiding (dock stays visible)
    mouseMoveTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    // Cleanup function
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove as EventListener);
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
    };
  }, [isFullscreen, showDock]);

  // Check URL for fullscreen param on initial load
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

  // Toggle dock visibility
  const toggleDockVisibility = () => {
    setShowDock(!showDock);
  };

  // Floating dock of controls for both fullscreen and normal mode
  const ControlDock = () => {
    // Calculate which page we're viewing based on current page (0-indexed) + 1
    const currentDisplayPage = currentPage + 1;
    const totalPages = score && score.total_pages ? score.total_pages : "?";

    // Track if we're on a small screen for responsive UI
    const [isSmallScreen, setIsSmallScreen] = useState(false);

    // Detect small screens
    useEffect(() => {
      const checkScreenSize = () => {
        setIsSmallScreen(window.innerWidth < 500);
      };

      // Check on mount and resize
      checkScreenSize();
      window.addEventListener("resize", checkScreenSize);

      return () => window.removeEventListener("resize", checkScreenSize);
    }, []);

    return (
      <div
        ref={dockRef}
        className={`fixed bottom-0 left-0 right-0 flex justify-center pb-2 transition-opacity duration-300 ${
          showDock ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className={`flex flex-wrap items-center bg-gray-800/50 backdrop-blur-sm rounded-full ${
            isSmallScreen ? "p-2" : "p-3"
          } shadow-lg max-w-[95vw] overflow-hidden`}
        >
          {/* Record button with compatibility indicator */}
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
              className={`
                          ${
                            isRecording
                              ? "bg-red-600"
                              : recordingCompatible === false
                                ? "bg-amber-600"
                                : "bg-primary"
                          }
                          text-white
                          ${isSmallScreen ? "w-10 h-10" : "w-14 h-14"}
                          rounded-full
                          flex items-center justify-center
                          ${isSmallScreen ? "mr-1" : "mr-3"}
                          relative
                        `}
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

          {/* Previous recordings button */}
          <BasicTooltip text="View previous recordings">
            <Button
              onClick={() => setShowRecordingsModal(!showRecordingsModal)}
              variant="ghost"
              size="icon"
              className={`text-white ${isSmallScreen ? "mr-1" : "mr-3"}`}
            >
              <Clock className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`} />
            </Button>
          </BasicTooltip>

          <BasicTooltip text="Previous metrics">
            <Button
              onClick={() => setShowMetricsPanel(!showMetricsPanel)}
              variant="ghost"
              size="icon"
              className={`text-white ${isSmallScreen ? "mr-1" : "mr-3"}`}
            >
              <BarChart2 className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`} />
            </Button>
          </BasicTooltip>

          {/* Divider */}
          <div
            className={`h-10 w-px bg-gray-400 ${
              isSmallScreen ? "mx-1" : "mx-3"
            }`}
          ></div>

          {/* Previous page */}
          <BasicTooltip text="Previous page">
            <Button
              onClick={goToPrevPage}
              variant="ghost"
              size="icon"
              className="text-white"
              disabled={currentPage <= 0}
            >
              <ArrowLeftCircle
                className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
              />
            </Button>
          </BasicTooltip>

          {/* Page counter */}
          <div
            className={`${
              isSmallScreen ? "px-1 text-sm" : "px-4"
            } text-white font-medium whitespace-nowrap`}
          >
            {currentDisplayPage} / {totalPages}
          </div>

          {/* Next page */}
          <BasicTooltip text="Next page">
            <Button
              onClick={goToNextPage}
              variant="ghost"
              size="icon"
              className={`text-white ${isSmallScreen ? "mr-1" : "mr-3"}`}
            >
              <ArrowRightCircle
                className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
              />
            </Button>
          </BasicTooltip>

          {/* Divider */}
          <div
            className={`h-10 w-px bg-gray-400 ${
              isSmallScreen ? "mx-1" : "mx-3"
            }`}
          ></div>

          {/* Reset zoom button */}
          <BasicTooltip text="Reset zoom">
            <Button
              variant="ghost"
              size="icon"
              ref={recenterButton}
              className={`text-white ${isSmallScreen ? "mr-1" : "mr-3"}`}
            >
              <Fullscreen
                className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
              />
            </Button>
          </BasicTooltip>

          {/* Fullscreen toggle */}
          <BasicTooltip
            text={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className={`text-white ${isSmallScreen ? "mr-1" : "mr-3"}`}
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

          {/* Hide/Show dock toggle (only in fullscreen) */}
          {isFullscreen && (
            <BasicTooltip text={showDock ? "Hide controls" : "Show controls"}>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleDockVisibility}
                className="text-white"
              >
                {showDock ? (
                  <EyeOff
                    className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`}
                  />
                ) : (
                  <Eye className={`${isSmallScreen ? "h-4 w-4" : "h-6 w-6"}`} />
                )}
              </Button>
            </BasicTooltip>
          )}
        </div>

        {showRecordingsModal && (
          <RecordingsModal
            open={showRecordingsModal}
            onClose={() => setShowRecordingsModal(false)}
            scoreId={id as string}
            onLoad={(buf) => {
              if (!scoringResultType) return;
              const decoded = scoringResultType.decode(new Uint8Array(buf));
              setEditList(decoded);
            }}
          />
        )}
      </div>
    );
  };

  // Top bar with title and main controls
  function TopBar() {
    // Track if we're on a small screen for responsive UI
    const [isSmallScreen, setIsSmallScreen] = useState(false);

    // Detect small screens
    useEffect(() => {
      const checkScreenSize = () => {
        setIsSmallScreen(window.innerWidth < 500);
      };

      // Check on mount and resize
      checkScreenSize();
      window.addEventListener("resize", checkScreenSize);

      return () => window.removeEventListener("resize", checkScreenSize);
    }, []);

    return (
      <div
        className={`absolute top-0 left-0 right-0 z-10 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onMouseEnter={() => setShowControls(true)}
      >
        <div
          className={`flex items-center justify-between ${
            isSmallScreen ? "p-2" : "p-4"
          } bg-white ${isFullscreen ? "dark:bg-gray-800" : "dark:bg-inherit"}`}
        >
          <div className="flex gap-2 place-items-center overflow-hidden">
            {isFullscreen ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className={isSmallScreen ? "h-8 w-8 mr-1" : ""}
              >
                <Minimize2 className={isSmallScreen ? "h-4 w-4" : "h-5 w-5"} />
              </Button>
            ) : (
              <Link href="/" className="text-muted-foreground">
                <ArrowLeft className={isSmallScreen ? "h-4 w-4" : "h-6 w-6"} />
              </Link>
            )}
            <p
              className={`${
                isFullscreen ? "text-xl text-white dark:text-white" : "text-2xl"
              } ${isSmallScreen ? "text-sm" : ""} ml-1 truncate`}
            >
              {score.name}
              {score.subtitle && !isSmallScreen && (
                <span
                  className={`${
                    isFullscreen
                      ? "text-gray-300 dark:text-gray-300"
                      : "text-gray-500 dark:text-gray-400"
                  } ml-2`}
                >
                  {score.subtitle}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-x-1">
            <BasicTooltip text="Download">
              <Button
                variant="ghost"
                onClick={() =>
                  window.open(
                    storage.getFileDownload(
                      process.env.NEXT_PUBLIC_SCORES_BUCKET!,
                      score.file_id!,
                    ),
                  )
                }
                className={isSmallScreen ? "h-8 w-8" : ""}
              >
                <Download className={isSmallScreen ? "h-3 w-3" : "h-4 w-4"} />
              </Button>
            </BasicTooltip>
            <BasicTooltip text="Star">
              <Button
                variant="ghost"
                onClick={() => onStarToggle(score)}
                className={isSmallScreen ? "h-8 w-8" : ""}
              >
                <Star
                  className={`${isSmallScreen ? "h-3 w-3" : "size-4"} ${
                    score.starred
                      ? "text-yellow-400 fill-yellow-400"
                      : isFullscreen
                        ? "text-white"
                        : "text-black dark:text-white"
                  }`}
                />
              </Button>
            </BasicTooltip>
            {!isFullscreen && (
              <BasicTooltip text="Enter fullscreen">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFullscreen}
                  className={isSmallScreen ? "h-8 w-8" : ""}
                >
                  <Maximize2
                    className={isSmallScreen ? "h-3 w-3" : "h-4 w-4"}
                  />
                </Button>
              </BasicTooltip>
            )}
            {!isFullscreen && !isSmallScreen && (
              <NotImplementedTooltip>
                <Button
                  variant="ghost"
                  disabled
                  className={isSmallScreen ? "h-8 w-8" : ""}
                >
                  <Share2 className={isSmallScreen ? "h-3 w-3" : "h-4 w-4"} />
                </Button>
              </NotImplementedTooltip>
            )}
          </div>
        </div>
      </div>
    );
  }

  // When in fullscreen mode
  if (isFullscreen) {
    return (
      <div className="w-full h-screen overflow-hidden bg-gray-900">
        {/* Top bar */}
        <TopBar />

        {/* Main score renderer - fills entire screen */}
        <div className="h-full w-full relative">
          {score && score.$id && score.file_id ? (
            score.is_mxl ? (
              <MusicXMLRenderer
                scoreId={score.file_id}
                recenter={recenterButton}
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
                  refetch();
                }}
                isFullscreen={isFullscreen}
                currentPage={currentPage}
                pagesPerView={1}
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
                  refetch();
                }}
                isFullscreen={isFullscreen}
                currentPage={currentPage}
                pagesPerView={1}
              />
            )
          ) : (
            ""
          )}

          {/* Control dock */}
          <ControlDock />

          {showMetricsPanel && (
            <div className="fixed bottom-20 right-4 bg-gray-800 text-white p-3 rounded shadow-lg z-50 text-sm">
              <div>Unstable Rate: {unstableRate.toFixed(3)}</div>
              <div>Accuracy: {accuracy}%</div>
              <button className="mt-1 underline" onClick={() => setShowMetricsPanel(false)}>
                Close
              </button>
            </div>
          )}

          {/* Debug panel - only render on client side */}
          {isClient && isDebugMode && (
            <DebugPanel
              scoreId={id as string}
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

          {/* Floating show button that appears when dock is hidden */}
          {!showDock && (
            <div
              className="fixed bottom-8 right-8 z-10 transition-opacity duration-300 opacity-80 hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <BasicTooltip text="Show controls">
                <Button
                  variant="secondary"
                  size="icon"
                  className="bg-gray-800/50 backdrop-blur-sm text-white rounded-full w-12 h-12 shadow-lg"
                  onClick={() => setShowDock(true)}
                >
                  <Eye className="h-6 w-6" />
                </Button>
              </BasicTooltip>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Regular mode with floating UI elements
  return (
    <Layout>
      <div className="relative h-[calc(100vh-5rem)]">
        {/* Top bar - same in both modes */}
        <TopBar />

        {/* Main score renderer - fills entire screen */}
        <div className="h-full w-full pt-16 relative">
          {score && score.$id && score.file_id ? (
            score.is_mxl ? (
              <MusicXMLRenderer
                scoreId={score.file_id}
                recenter={recenterButton}
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
                  refetch();
                }}
                currentPage={currentPage}
                pagesPerView={1}
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
                  refetch();
                }}
                currentPage={currentPage}
                pagesPerView={1}
              />
            )
          ) : (
            ""
          )}

          {/* Control dock */}
          <ControlDock />

          {/* Debug panel - only render on client side */}
          {isClient && isDebugMode && (
            <DebugPanel
              scoreId={id as string}
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
      </div>
    </Layout>
  );
}
