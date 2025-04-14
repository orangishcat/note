"use client"

import {useParams} from "next/navigation"
import {useEffect, useRef, useState} from "react"
import Link from "next/link"
import {
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
    Star
} from "lucide-react"
import {Button} from "@/components/ui/button"
import {Layout} from "@/components/layout"
import MusicXMLRenderer, {MusicScore} from "@/components/music-xml-renderer"
import NotImplementedTooltip from "@/components/ui-custom/not-implemented-tooltip"
import {useQuery} from "@tanstack/react-query"
import BasicTooltip from "@/components/ui-custom/basic-tooltip"
import axios from "axios";
import ImageScoreRenderer from "@/components/image-score-renderer";
import protobuf, {Message, Type} from 'protobufjs';
import log from '@/lib/logger';
import { useEditDisplay, setupEditEventHandlers } from '@/lib/edit-display';
import { useAudioRecorder } from '@/lib/audio-recorder';

// Protobuf type references
let NoteListType: Type | null = null;
let EditListType: Type | null = null;

// Initialize protobuf types
const initProtobufTypes = async () => {
    log.info('Initializing protobuf types');
    const root = await protobuf.load('/static/notes.proto');
    NoteListType = root.lookupType('NoteList');
    EditListType = root.lookupType('EditList');
    log.info('Protobuf types initialized');
    return {NoteListType, EditListType};
};

export default function ScorePage() {
    // Fetch protobuf types
    const {data: protobufTypes, isSuccess: protobufReady, refetch: refetchTypes} = useQuery({
        queryKey: ['protobufTypes'],
        queryFn: initProtobufTypes,
        staleTime: Infinity, // Cache forever unless explicitly invalidated
    });

    // Page state
    const params = useParams();
    const id = params.id as string;
    const [score, setScore] = useState<MusicScore>({
        id: "",
        title: "loading",
        subtitle: "you're not supposed to be seeing this. if you are, good for you.",
        upload_date: "now",
        total_pages: 1
    });
    const [lastStarTime, setLastStarTime] = useState(0);
    const [editList, setEditList] = useState<Message | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [showDock, setShowDock] = useState(true);
    const [showRecordingsModal, setShowRecordingsModal] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [totalPages, setTotalPages] = useState<number | null>(null);
    const [notes, setNotes] = useState<Message | null>(null);
    
    // Refs
    const mouseMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const fetchedDataRef = useRef<boolean>(false); // Prevent duplicate API calls during React's double-render
    const recenterButton = useRef<HTMLButtonElement>(null);
    
    // Recording state
    const [isRecording, setIsRecording] = useState(false);

    // Initialize protobuf types
    useEffect(() => {
        if (!protobufTypes) return;
        NoteListType = protobufTypes.NoteListType;
        EditListType = protobufTypes.EditListType;
    }, [protobufTypes]);

    // Use the edit display hook
    useEditDisplay(editList, notes, currentPage, score.id);

    // Setup event handlers for edit display
    setupEditEventHandlers(
        id, 
        setCurrentPage, 
        setEditList,
        editList,
        currentPage
    );

    // Use the audio recorder hook
    const { recorder } = useAudioRecorder({
        isRecording,
        notes,
        EditListType,
        onEditListChange: setEditList,
        refetchTypes
    });

    const onStarToggle = (score: MusicScore) => {
        setLastStarTime(Date.now());
        if (Date.now() - lastStarTime < 700) return;
        setScore({...score, starred: !score.starred});
        axios.post(`/api/score/star/${score.id}`, {starred: !score.starred}).catch(log.error);
    }

    const {data: loadedScore, refetch} = useQuery({
        queryKey: ["score_" + id],
        queryFn: async () => {
            // Prevent duplicate API calls during StrictMode's double-render
            if (fetchedDataRef.current) {
                log.info('Preventing duplicate score data fetch during development double-render');
                // Wait for the first render's fetch to complete
                await new Promise(resolve => setTimeout(resolve, 100));
                return null; // Let React Query handle the caching
            }

            // Mark that we've started a fetch
            fetchedDataRef.current = true;

            return axios.get<MusicScore>(`/api/score/data/${id}`).then(resp => resp.data);
        },
    });

    useEffect(() => {
        if (!loadedScore) return;
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
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('touchmove', handleTouchMove as EventListener);

        // Initialize timeout for top bar hiding (dock stays visible)
        mouseMoveTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
        }, 3000);

        // Cleanup function
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('touchmove', handleTouchMove as EventListener);
            if (mouseMoveTimeoutRef.current) {
                clearTimeout(mouseMoveTimeoutRef.current);
            }
        };
    }, [isFullscreen, showDock]);

    // Check URL for fullscreen param on initial load
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            const fullscreenParam = url.searchParams.get('fullscreen');
            if (fullscreenParam === 'true') {
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
            const {totalPages, scoreId} = customEvent.detail;

            if (scoreId === id || scoreId === score.file_id) {
                setTotalPages(totalPages);
                // Update score object with totalPages
                setScore(prevScore => ({
                    ...prevScore,
                    total_pages: totalPages
                }));
            }
        };

        // Listen for page info events
        document.addEventListener('score:pageInfo', handlePageInfo);

        return () => {
            document.removeEventListener('score:pageInfo', handlePageInfo);
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

    // Toggle recording state
    const toggleRecording = async () => {
        setIsRecording(!isRecording);
    }

    // Add query for fetching notes data
    const {data: notesData} = useQuery({
        queryKey: ["notes_" + id],
        queryFn: async () => {
            if (!score.notes_id) return null;
            const response = await fetch(`/api/score/notes/${score.notes_id}`);
            return await response.arrayBuffer();
        },
        enabled: !!score.notes_id
    });

    // Decode protobuf data when notesData is available
    useEffect(() => {
        if (!notesData || !NoteListType) return;

        try {
            const decoded = NoteListType.decode(new Uint8Array(notesData));
            setNotes(decoded);
        } catch (error) {
            log.error('Error decoding protobuf:', error);
        }
    }, [notesData]);

    // Floating dock of controls for both fullscreen and normal mode
    const ControlDock = () => {
        // Calculate which page we're viewing based on current page (0-indexed) + 1
        const currentDisplayPage = currentPage + 1;
        const totalPages = score && score.total_pages ? score.total_pages : '?';

        return (
          <div
            ref={dockRef}
            className={`absolute w-full flex justify-center bottom-8 left-1/2 transform -translate-x-1/2 transition-opacity duration-300 ${showDock ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
              <div className="flex items-center bg-gray-800/50 backdrop-blur-sm rounded-full p-3 shadow-lg">
                  {/* Record button */}
                  <BasicTooltip text={isRecording ? "Stop recording" : "Start recording"}>
                      <Button
                        onClick={toggleRecording}
                        className={`${isRecording ? 'bg-red-600' : 'bg-primary'} text-white w-14 h-14 rounded-full flex items-center justify-center mr-3`}
                      >
                          {isRecording ? <SquareIcon className="h-6 w-6"/> : <Mic className="h-6 w-6"/>}
                      </Button>
                  </BasicTooltip>

                  {/* Previous recordings button */}
                  <BasicTooltip text="View previous recordings">
                      <Button
                        onClick={() => setShowRecordingsModal(!showRecordingsModal)}
                        variant="ghost"
                        size="icon"
                        className="text-white mr-3"
                      >
                          <Clock className="h-6 w-6"/>
                      </Button>
                  </BasicTooltip>

                  {/* Divider */}
                  <div className="h-10 w-px bg-gray-400 mx-3"></div>

                  {/* Previous page */}
                  <BasicTooltip text="Previous page">
                      <Button
                        onClick={goToPrevPage}
                        variant="ghost"
                        size="icon"
                        className="text-white"
                        disabled={currentPage <= 0}
                      >
                          <ArrowLeftCircle className="h-6 w-6"/>
                      </Button>
                  </BasicTooltip>

                  {/* Page counter */}
                  <div className="px-4 text-white font-medium">
                      {currentDisplayPage} / {totalPages}
                  </div>

                  {/* Next page */}
                  <BasicTooltip text="Next page">
                      <Button
                        onClick={goToNextPage}
                        variant="ghost"
                        size="icon"
                        className="text-white mr-3"
                      >
                          <ArrowRightCircle className="h-6 w-6"/>
                      </Button>
                  </BasicTooltip>

                  {/* Divider */}
                  <div className="h-10 w-px bg-gray-400 mx-3"></div>

                  {/* Reset zoom button */}
                  <BasicTooltip text="Reset zoom">
                      <Button
                        variant="ghost"
                        size="icon"
                        ref={recenterButton}
                        className="text-white mr-3"
                      >
                          <Fullscreen className="h-6 w-6"/>
                      </Button>
                  </BasicTooltip>

                  {/* Fullscreen toggle */}
                  <BasicTooltip text={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleFullscreen}
                        className="text-white mr-3"
                      >
                          {isFullscreen ? <Minimize2 className="h-6 w-6"/> : <Maximize2 className="h-6 w-6"/>}
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
                            {showDock ? <EyeOff className="h-6 w-6"/> : <Eye className="h-6 w-6"/>}
                        </Button>
                    </BasicTooltip>
                  )}
              </div>

              {/* Recordings modal - appears above the button */}
              {showRecordingsModal && (
                <div
                  className="absolute bottom-20 left-[calc(25%)] bg-gray-800/50 backdrop-blur-sm text-white rounded-lg shadow-lg p-4 w-64">
                    <div className="text-center mb-2 font-semibold">Previous Recordings</div>
                    <div className="text-center text-gray-300 italic">No recordings yet</div>
                    {/* Arrow pointing to button */}
                    <div className="absolute -bottom-2 left-12 w-4 h-4 bg-gray-800/50 transform rotate-45"></div>
                </div>
              )}
          </div>
        );
    };

    // Top bar with title and main controls
    function TopBar() {
        return <div
          className={`absolute top-0 left-0 right-0 z-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onMouseEnter={() => setShowControls(true)}
        >
            <div
              className={`flex items-center justify-between p-4 bg-white ${isFullscreen ? "dark:bg-gray-800" : "dark:bg-inherit"}`}>
                <div className="flex gap-2 place-items-center">
                    {isFullscreen ? (
                      <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
                          <Minimize2 className="h-5 w-5"/>
                      </Button>
                    ) : (
                      <Link href="/" className="text-muted-foreground">
                          <ArrowLeft className="h-6 w-6"/>
                      </Link>
                    )}
                    <p className={`${isFullscreen ? 'text-xl text-white dark:text-white' : 'text-2xl'} ml-2`}>
                        {score.title}
                        {score.subtitle && (
                          <span
                            className={`${isFullscreen ? 'text-gray-300 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'} ml-2`}>
                                {score.subtitle}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-x-2">
                    <BasicTooltip text="Download">
                        <Button
                          variant="ghost"
                          onClick={() => window.open(`/api/score/download/${score.id}`)}
                        >
                            <Download className="h-4 w-4"/>
                        </Button>
                    </BasicTooltip>
                    <BasicTooltip text="Star">
                        <Button variant="ghost" onClick={() => onStarToggle(score)}>
                            <Star
                              className={`size-4 ${score.starred ? "text-yellow-400 fill-yellow-400" : isFullscreen ? "text-white" : "text-black dark:text-white"}`}/>
                        </Button>
                    </BasicTooltip>
                    {!isFullscreen && (
                      <BasicTooltip text="Enter fullscreen">
                          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
                              <Maximize2 className="h-4 w-4"/>
                          </Button>
                      </BasicTooltip>
                    )}
                    {!isFullscreen && (
                      <NotImplementedTooltip>
                          <Button variant="ghost" disabled>
                              <Share2 className="h-4 w-4"/>
                          </Button>
                      </NotImplementedTooltip>
                    )}
                </div>
            </div>
        </div>;
    }

    // When in fullscreen mode
    if (isFullscreen) {
        return (
          <div className="w-full h-screen overflow-hidden bg-gray-900">
              {/* Top bar */}
              <TopBar/>

              {/* Main score renderer - fills entire screen */}
              <div className="h-full w-full relative">
                  {score && score.id && score.file_id ? (
                    score.is_mxl ?
                      <MusicXMLRenderer
                        scoreId={score.file_id}
                        recenter={recenterButton}
                        retry={refetch}
                        isFullscreen={true}
                        currentPage={currentPage}
                        pagesPerView={1}
                      /> :
                      <ImageScoreRenderer
                        scoreId={score.id}
                        recenter={recenterButton}
                        retry={refetch}
                        isFullscreen={true}
                        currentPage={currentPage}
                        pagesPerView={1}
                      />
                  ) : ""}

                  {/* Control dock */}
                  <ControlDock/>

                  {/* Floating show button that appears when dock is hidden */}
                  {!showDock && (
                    <div
                      className="fixed bottom-8 right-8 z-10 transition-opacity duration-300 opacity-80 hover:opacity-100">
                        <BasicTooltip text="Show controls">
                            <Button
                              variant="secondary"
                              size="icon"
                              className="bg-gray-800/50 backdrop-blur-sm text-white rounded-full w-12 h-12 shadow-lg"
                              onClick={() => setShowDock(true)}
                            >
                                <Eye className="h-6 w-6"/>
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
              <TopBar/>

              {/* Main score renderer - fills entire screen */}
              <div className="h-full w-full pt-16 relative">
                  {score && score.id && score.file_id ? (
                    score.is_mxl ?
                      <MusicXMLRenderer
                        scoreId={score.file_id}
                        recenter={recenterButton}
                        retry={refetch}
                        currentPage={currentPage}
                        pagesPerView={1}
                      /> :
                      <ImageScoreRenderer
                        scoreId={score.id}
                        recenter={recenterButton}
                        retry={refetch}
                        currentPage={currentPage}
                        pagesPerView={1}
                      />
                  ) : ""}

                  {/* Control dock */}
                  <ControlDock/>
              </div>
          </div>
      </Layout>
    );
}
