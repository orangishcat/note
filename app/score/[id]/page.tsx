"use client"

import {useParams, useRouter} from "next/navigation"
import React, {useEffect, useRef, useState} from "react"
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
    Star,
    AlertTriangle
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
import {setupEditEventHandlers, useEditDisplay} from '@/lib/edit-display';
import {RecordingError, useAudioRecorder} from '@/lib/audio-recorder';
import ComparisonDialog from '@/components/ComparisonDialog';
import {splitCombinedResponse} from '@/lib/audio-recorder';
import {useToast} from '@/components/ui/toast';
import api from "@/lib/network";

// Define EditOperation enum here since modular files were deleted
const initialDebug = false; // Default value for server-side rendering

// Add a global type declaration to prevent TypeScript errors
declare global {
  interface Window {
    lastRefetchTime?: number;
  }
}

// Protobuf type cache as a module-level variable
let protobufTypeCache: {
    EditListType: Type | null;
    NoteListType: Type | null;
    initialized: boolean;
    initializing: boolean;
    error: Error | null;
} = {
    EditListType: null,
    NoteListType: null,
    initialized: false,
    initializing: false,
    error: null
};

// Initialize protobuf types
const initProtobufTypes = async (): Promise<{ EditListType: Type | null, NoteListType: Type | null }> => {
    // Return from cache if already initialized
    if (protobufTypeCache.initialized && protobufTypeCache.EditListType && protobufTypeCache.NoteListType) {
        return {
            EditListType: protobufTypeCache.EditListType,
            NoteListType: protobufTypeCache.NoteListType
        };
    }

    // Return null if currently initializing to prevent multiple simultaneous loads
    if (protobufTypeCache.initializing) {
        return {
            EditListType: null,
            NoteListType: null
        };
    }

    log.debug('Initializing protobuf types');
    protobufTypeCache.initializing = true;
    protobufTypeCache.error = null;

    try {
        // Force cache refresh by adding timestamp to URL
        const timestamp = Date.now();
        const protoUrl = `/static/notes.proto?t=${timestamp}`;
        log.debug(`Loading proto definition from ${protoUrl}`);

        const root = await protobuf.load(protoUrl);

        // Verify the EditList type has the expected structure
        const EditListType = root.lookupType('EditList');

        // Check if EditList has the expected fields
        const editListFields = EditListType.fieldsArray.map(f => f.name);
        log.debug(`EditList fields: ${editListFields.join(', ')}`);

        if (!editListFields.includes('edits')) {
            log.warn('EditList type is missing the "edits" field');
        }

        if (!editListFields.includes('size')) {
            log.warn('EditList type is missing the "size" field');
        }

        // Initialize NoteList type
        const NoteListType = root.lookupType('NoteList');

        // Check if NoteList has the expected fields
        const noteListFields = NoteListType.fieldsArray.map(f => f.name);
        log.debug(`NoteList fields: ${noteListFields.join(', ')}`);

        if (!noteListFields.includes('notes')) {
            log.warn('NoteList type is missing the "notes" field');
        }

        if (!noteListFields.includes('size')) {
            log.warn('NoteList type is missing the "size" field');
        }

        // Update cache
        protobufTypeCache = {
            EditListType,
            NoteListType,
            initialized: true,
            initializing: false,
            error: null
        };

        log.debug('Protobuf types initialized successfully');
        return { EditListType, NoteListType };
    } catch (error) {
        log.error('Error initializing protobuf types:', error);

        // Update cache with error
        protobufTypeCache = {
            EditListType: null,
            NoteListType: null,
            initialized: false,
            initializing: false,
            error: error instanceof Error ? error : new Error(String(error))
        };

        return { EditListType: null, NoteListType: null };
    }
};

// Debug panel component
// Test Type Selector component
const TestTypeSelector = ({
    isOpen,
    onClose,
    onSelectTestType
}: {
    isOpen: boolean,
    onClose: () => void,
    onSelectTestType: (testType: string) => void
}) => {
    if (!isOpen) return null;

    const testTypes = [
        { id: 'spider_dance_actual', name: 'Spider Dance Actual' },
        { id: 'spider_dance_played', name: 'Spider Dance Played' }
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-4 shadow-lg max-w-md w-full">
                <h3 className="text-white text-lg font-semibold mb-4">Select Test Type</h3>
                <div className="space-y-2">
                    {testTypes.map(type => (
                        <button
                            key={type.id}
                            onClick={() => {
                                onSelectTestType(type.id);
                                onClose();
                            }}
                            className="w-full text-left px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
                        >
                            {type.name}
                        </button>
                    ))}
                </div>
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

const DebugPanel = ({scoreId, editList, setEditList, playedNotes, scoreNotes, currentPage, editsOnPage, setPlayedNotes}: {
    scoreId: string,
    editList: Message | null,
    setEditList: (editList: Message | null) => void,
    playedNotes: Message | null,
    scoreNotes: Message | null,
    currentPage: number,
    editsOnPage: number,
    setPlayedNotes: (playedNotes: Message | null) => void
}) => {
    const [position, setPosition] = useState({ x: 20, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [isSendingTest, setIsSendingTest] = useState(false);
    const [testStatus, setTestStatus] = useState<{message: string, isError: boolean} | null>(null);
    const [showNoteNames, setShowNoteNames] = useState(false);
    const [showComparisonDialog, setShowComparisonDialog] = useState(false);
    const [showTestTypeSelector, setShowTestTypeSelector] = useState(false);
    const [currentTestType, setCurrentTestType] = useState('spider_dance_played'); // Default to spider dance actual
    const [comparisonData, setComparisonData] = useState<{
        note: any;
        targetNote?: any;
        editOperation?: string;
        position?: number;
    }>({ note: null });
    const [comparisonNoteCount, setComparisonNoteCount] = useState<number>(15); // Default to 15 notes
    const dragStartPos = useRef({ x: 0, y: 0 });
    const panelRef = useRef<HTMLDivElement>(null);

    // Clear status message after 5 seconds
    useEffect(() => {
        if (testStatus) {
            const timer = setTimeout(() => {
                setTestStatus(null);
            }, 5000);

            return () => clearTimeout(timer);
        }
    }, [testStatus]);

    // Load saved position from localStorage on mount - client-side only
    useEffect(() => {
        // Only run on the client side
        if (typeof window === 'undefined') return;

        try {
            const savedPosition = localStorage.getItem('debugPanelPosition');
            if (savedPosition) {
                const parsedPosition = JSON.parse(savedPosition);
                setPosition(parsedPosition);
            }

            // Load note names preference
            const savedShowNoteNames = localStorage.getItem('debugShowNoteNames');
            if (savedShowNoteNames) {
                setShowNoteNames(savedShowNoteNames === 'true');
            }

            // Load comparison note count preference
            const savedComparisonNoteCount = localStorage.getItem('debugComparisonNoteCount');
            if (savedComparisonNoteCount) {
                setComparisonNoteCount(parseInt(savedComparisonNoteCount, 10));
            }
        } catch (e) {
            log.error('Error loading debug panel position:', e);
        }
    }, []);

    // Save position to localStorage when it changes
    useEffect(() => {
        // Only run on the client side
        if (typeof window === 'undefined') return;

        if (position.x !== 0 || position.y !== 0) {
            localStorage.setItem('debugPanelPosition', JSON.stringify(position));
        }
    }, [position]);

    // Save show note names preference when it changes
    useEffect(() => {
        // Only run on the client side
        if (typeof window === 'undefined') return;

        localStorage.setItem('debugShowNoteNames', String(showNoteNames));

        // Trigger redraw of annotations when the setting changes
        if (editList) {
            redrawAnnotations();
        }

        // Dispatch custom event to notify edit-display.ts about the preference change
        const event = new CustomEvent('debug:toggleNoteNames', {
            detail: {
                showNoteNames
            },
            bubbles: true
        });
        document.dispatchEvent(event);
    }, [showNoteNames]);

    // Save comparison note count when it changes
    useEffect(() => {
        // Only run on the client side
        if (typeof window === 'undefined') return;

        localStorage.setItem('debugComparisonNoteCount', String(comparisonNoteCount));

        // Dispatch custom event to notify ComparisonDialog about the preference change
        const event = new CustomEvent('debug:updateComparisonNoteCount', {
            detail: {
                comparisonNoteCount
            },
            bubbles: true
        });
        document.dispatchEvent(event);
    }, [comparisonNoteCount]);

    // Handle note count changes
    const handleComparisonNoteCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 1 && value <= 50) {
            setComparisonNoteCount(value);
        }
    };

    // Handle mouse down to start dragging
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);

        // Store current mouse position
        dragStartPos.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    // Handle mouse move while dragging
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            // Calculate new position
            const newX = e.clientX - dragStartPos.current.x;
            const newY = e.clientY - dragStartPos.current.y;

            // Apply new position
            setPosition({ x: newX, y: newY });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Toggle note names display
    const toggleNoteNames = () => {
        setShowNoteNames(!showNoteNames);
    };

    // Send a test request to the audio endpoint without actually recording audio
    const sendTestRequest = async (e?: React.MouseEvent) => {
        if (isSendingTest) return;

        // Check if shift key is pressed to show test type selector
        if (e && e.shiftKey) {
            setShowTestTypeSelector(true);
            return;
        }

        setIsSendingTest(true);
        setTestStatus(null);

        try {
            log.debug(`Sending test audio request with type: ${currentTestType}`);

            // Create a more realistic audio blob - we'll generate a proper WebM container
            // This is a pre-recorded empty WebM opus file (1 second of silence)
            // WebM header and minimal data structure
            const webmHeader = new Uint8Array([
                0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f, 0x42, 0x86, 0x81, 0x01,
                0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77,
                0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02, 0x18, 0x53, 0x80, 0x67, 0x01,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x4d, 0xbb, 0x8b, 0x53, 0xab, 0x84, 0x15, 0x49,
                0xa9, 0x66, 0x53, 0xac, 0x81, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
            ]);

            // WebM opus codec data
            const webmOpusCodec = new Uint8Array([
                0x1f, 0x43, 0xb6, 0x75, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xa3, 0x01, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x86, 0x01, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xA1, 0x00, 0x00, 
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
            ]);

            // Concatenate the header and data together
            const audioData = new Uint8Array(webmHeader.length + webmOpusCodec.length);
            audioData.set(webmHeader);
            audioData.set(webmOpusCodec, webmHeader.length);

            // Create the blob with the proper MIME type
            const emptyAudioBlob = new Blob([audioData], { type: 'audio/webm;codecs=opus' });

            log.debug(`Created test audio blob with size: ${emptyAudioBlob.size} bytes`);

            // Send the request to the audio processing endpoint
            const response = await api.post('/audio/receive', emptyAudioBlob, {
                headers: {
                    'Content-Type': 'audio/webm;codecs=opus',
                    'X-Score-ID': scoreId,
                    'X-Test-Type': currentTestType
                },
                responseType: 'arraybuffer'
            });

            log.debug('Received test response');

            if (response.status !== 200) {
                throw new Error(`Server returned status ${response.status}`);
            }

            // Process the response - similar to how audio-recorder.ts does it
            const buffer = response.data;

            // Initialize protobuf types if needed
            const { EditListType, NoteListType } = await initProtobufTypes();
            if (!EditListType || !NoteListType) {
                throw new Error("Failed to initialize EditListType or NoteListType");
            }

            // Try to decode the protobuf data
            try {
                const dataView = new Uint8Array(buffer);

                // Log first few bytes for debugging
                const firstBytes = Array.from(dataView.slice(0, 20))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join(' ');
                log.debug(`First bytes of buffer: ${firstBytes}`);

                // Check for combined format
                const responseFormat = response.headers?.['x-response-format'];
                if (responseFormat === 'combined') {
                    log.debug("Detected combined response format");

                    // Use the splitCombinedResponse utility to decode both parts
                    const { editList, playedNotes: receivedPlayedNotes } = splitCombinedResponse(
                        buffer,
                        EditListType,
                        NoteListType
                    );

                    if (editList) {
                        const editCount = (editList as any).edits?.length || 0;
                        log.debug(`Successfully decoded test response with ${editCount} edits`);
                        setEditList(editList);

                        // Also update played notes if available
                        if (receivedPlayedNotes) {
                            const noteCount = (receivedPlayedNotes as any).notes?.length || 0;
                            log.debug(`Successfully decoded test response with ${noteCount} played notes`);
                            setPlayedNotes(receivedPlayedNotes);
                        }

                        // Set success status message
                        setTestStatus({
                            message: `Success! Received ${editCount} edits and ${(receivedPlayedNotes as any)?.notes?.length || 0} notes`,
                            isError: false
                        });
                    } else {
                        throw new Error("Failed to decode EditList from combined response");
                    }
                } else {
                    // Legacy format - just decode EditList
                    log.debug("Using legacy format (EditList only)");
                    const decoded = EditListType.decode(dataView);
                    const editCount = (decoded as any).edits?.length || 0;
                    log.debug(`Successfully decoded test response with ${editCount} edits`);

                    // Update the edit list
                    setEditList(decoded);

                    // Set success status message
                    setTestStatus({
                        message: `Success! Received ${editCount} edits`,
                        isError: false
                    });
                }
            } catch (error) {
                log.error('Error decoding test response:', error);
                setTestStatus({
                    message: `Error decoding response: ${error instanceof Error ? error.message : String(error)}`,
                    isError: true
                });
            }
        } catch (error) {
            log.error('Error sending test request:', error);
            setTestStatus({
                message: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
                isError: true
            });
        } finally {
            setIsSendingTest(false);
        }
    };

    // JSX for showing the test status message
    const renderTestStatus = () => {
        if (!testStatus) return null;

        return (
            <div className={`text-xs mt-2 p-1 rounded ${testStatus.isError ? 'bg-red-900/50 text-red-200' : 'bg-green-900/50 text-green-200'}`}>
                {testStatus.message}
            </div>
        );
    };

    const redrawAnnotations = () => {
        if (!editList) {
            log.warn("No annotations to redraw");
            return;
        }

        log.debug("Manually triggering annotation redraw");

        // Force a redraw by briefly setting editList to null then back
        const tempEditList = editList;
        setEditList(null);
        setTimeout(() => {
            setEditList(tempEditList);

            // Dispatch redraw event
            const event = new CustomEvent('score:redrawAnnotations', {
                detail: {
                    scoreId,
                    currentPage,
                },
                bubbles: true
            });
            document.dispatchEvent(event);
        }, 50);
    };

    const disableDebugMode = () => {
        localStorage.removeItem("debug");
        // Trigger storage event manually for same window
        window.dispatchEvent(new Event('storage'));
    };

    // Listen for edit comparison events
    useEffect(() => {
        const handleShowComparison = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { note, targetNote, editOperation, isTarget, position } = customEvent.detail;

            log.debug('Show comparison requested:', {
                note,
                targetNote,
                editOperation,
                isTarget,
                position
            });

            setComparisonData({
                note: isTarget ? targetNote : note,
                targetNote: isTarget ? note : targetNote,
                editOperation,
                position
            });

            setShowComparisonDialog(true);
        };

        document.addEventListener('edit:showComparison', handleShowComparison);

        return () => {
            document.removeEventListener('edit:showComparison', handleShowComparison);
        };
    }, []);

    // Function to close the comparison dialog
    const closeComparisonDialog = () => {
        setShowComparisonDialog(false);
    };

    return (
        <div
            ref={panelRef}
            className="fixed z-50 bg-black/70 text-white p-3 rounded-md shadow-lg"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: '13rem',
                cursor: isDragging ? 'grabbing' : 'default'
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Drag handle */}
            <div
                className="absolute top-0 left-0 right-0 h-7 bg-gray-700/80 rounded-t-md flex items-center px-2 cursor-grab"
                onMouseDown={handleMouseDown}
            >
                <div className="grid grid-cols-3 gap-1 mr-2">
                    <div className="w-1 h-1 rounded-full bg-gray-400"></div>
                    <div className="w-1 h-1 rounded-full bg-gray-400"></div>
                    <div className="w-1 h-1 rounded-full bg-gray-400"></div>
                    <div className="w-1 h-1 rounded-full bg-gray-400"></div>
                    <div className="w-1 h-1 rounded-full bg-gray-400"></div>
                    <div className="w-1 h-1 rounded-full bg-gray-400"></div>
                </div>
                <span className="text-xs font-semibold">Debug Panel</span>
            </div>

            <div className="flex flex-col gap-2 mt-6">
                <button
                    onClick={redrawAnnotations}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded"
                >
                    Redraw Annotations
                </button>

                {/* Show note names toggle button */}
                <button
                    onClick={toggleNoteNames}
                    className={`${showNoteNames ? 'bg-purple-600' : 'bg-gray-600'} hover:${showNoteNames ? 'bg-purple-700' : 'bg-gray-700'} text-white text-xs px-2 py-1 rounded`}
                >
                    {showNoteNames ? 'Hide Note Names' : 'Show Note Names'}
                </button>

                {/* Simple test request button */}
                <button
                    onClick={sendTestRequest}
                    disabled={isSendingTest}
                    className={`${isSendingTest ? 'bg-green-800' : 'bg-green-600 hover:bg-green-700'} text-white text-xs px-2 py-1 rounded flex items-center justify-center`}
                >
                    {isSendingTest ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Processing...
                        </>
                    ) : "Send Test Request"}
                </button>

                <button
                    onClick={disableDebugMode}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded"
                >
                    Disable Debug Mode
                </button>

                {/* Show test status */}
                {renderTestStatus()}

                <div className="text-xs mt-2">
                    <p>Page: {currentPage}</p>
                    <p>Edits: {editsOnPage}/{editList ? (editList as any).edits?.length || 0 : 0}</p>

                    {/* Comparison note count control */}
                    <div className="mt-2 flex flex-col gap-1">
                        <label className="text-gray-300 text-xs flex justify-between items-center">
                            <span>Comparison Note Count:</span>
                            <span className="text-white font-mono">{comparisonNoteCount}</span>
                        </label>
                        <input 
                            type="range" 
                            min="1" 
                            max="50" 
                            value={comparisonNoteCount}
                            onChange={handleComparisonNoteCountChange}
                            className="w-full accent-blue-500"
                        />
                        <div className="flex justify-between text-[10px] text-gray-400">
                            <span>1</span>
                            <span>25</span>
                            <span>50</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Render comparison dialog when needed */}
            {showComparisonDialog && (
                <ComparisonDialog
                    isOpen={showComparisonDialog}
                    onClose={closeComparisonDialog}
                    note={comparisonData.note}
                    targetNote={comparisonData.targetNote}
                    editOperation={comparisonData.editOperation}
                    position={comparisonData.position}
                    playedNotes={playedNotes}
                    scoreNotes={scoreNotes}
                />
            )}

            {/* Render test type selector when needed */}
            <TestTypeSelector
                isOpen={showTestTypeSelector}
                onClose={() => setShowTestTypeSelector(false)}
                onSelectTestType={(testType) => {
                    setCurrentTestType(testType);
                    setShowTestTypeSelector(false);
                    // Send the test request with the selected type
                    sendTestRequest();
                }}
            />
        </div>
    );
};

export default function ScorePage() {
    const router = useRouter();
    const {id} = useParams<{id: string}>();
    const [score, setScore] = useState<MusicScore>({
        id: "",
        title: "loading",
        subtitle: "you're not supposed to be seeing this. if you are, good for you.",
        upload_date: "now",
        total_pages: 1
    });
    const [editList, setEditList] = useState<Message | null>(null);
    const [playedNotes, setPlayedNotes] = useState<Message | null>(null);
    const [scoreNotes, setScoreNotes] = useState<Message | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [isDebugMode, setIsDebugMode] = useState(false); // Default false for server rendering
    const [editsOnPage, setEditsOnPage] = useState(0);
    const [isClient, setIsClient] = useState(false); // Track if we're on client side
    const {addToast} = useToast(); // Use the toast context
    const [recordingCompatible, setRecordingCompatible] = useState<boolean | null>(null);
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

        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    // State to track protobuf type initialization
    const [editListType, setEditListType] = useState<Type | null>(protobufTypeCache.EditListType);
    const [noteListType, setNoteListType] = useState<Type | null>(protobufTypeCache.NoteListType);

    // Function to refetch protobuf types
    const refetchTypes = async () => {
        const result = await initProtobufTypes();
        setEditListType(result.EditListType);
        setNoteListType(result.NoteListType);
        return result;
    };

    // Initialize protobuf types on component mount if not already initialized
    useEffect(() => {
        if (!protobufTypeCache.initialized && !protobufTypeCache.initializing) {
            refetchTypes();
        }
    }, []);

    // Fetch the score data
    useEffect(() => {
        // Skip fetch if we already have data or are using React Query
        if (score.id || fetchedDataRef.current) {
            return;
        }

        log.debug(`Fetching score data for ID: ${id}`);
        fetchedDataRef.current = true;

        async function fetchScore() {
            try {
                const response = await api.get(`/score/data/${id}`);
                log.debug(`Score data received:`, {id: response.data.id, title: response.data.title});
                setScore(response.data);
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    log.error(`Failed to fetch score: ${error.response?.status} ${error.response?.statusText}`);
                    if (error.response?.status === 404) {
                        // Handle 404 case - redirect to home page
                        log.error(`Score with ID ${id} not found`);
                        router.push('/');
                    }
                } else {
                    log.error('Error fetching score:', error);
                }
            }
        }

        if (id) {
            fetchScore();
        }
    }, [id, score.id]);

    // Fetch score notes when score is loaded
    useEffect(() => {
        // Skip if we don't have the score data yet or already have notes
        if (!score?.id || !score.notes_id || scoreNotes || !noteListType) {
            log.debug('Skipping score notes fetch due to missing score data or notes');
            return;
        }

        const fetchScoreNotes = async () => {
            try {
                log.debug(`Fetching notes for score ID: ${score.id}, notes_id: ${score.notes_id}`);
                const response = await api.get(`/score/notes/${score.notes_id}`, {
                    responseType: 'arraybuffer'
                });

                const buffer = response.data;
                log.debug(`Received score notes buffer of size: ${buffer.byteLength} bytes`);

                // Decode the notes
                const dataView = new Uint8Array(buffer);
                const notes = noteListType.decode(dataView);

                log.debug(`Successfully decoded score notes with ${(notes as any).notes?.length || 0} notes`);
                setScoreNotes(notes);
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    log.error(`Failed to fetch score notes: ${error.response?.status} ${error.response?.statusText}`);
                } else {
                    log.error('Error fetching score notes:', error);
                }
            }
        };

        fetchScoreNotes();
    }, [score?.id, score?.notes_id, scoreNotes, noteListType]);

    // Use the edit display hook
    useEditDisplay(editList, currentPage, id as string, setEditsOnPage);

    // Setup event handlers for page changes and annotation redraws
    setupEditEventHandlers(
        id as string,
        score?.file_id,
        setCurrentPage,
        setEditList,
        editList,
        currentPage
    );

    // Check for recording compatibility on component mount
    useEffect(() => {
        // Only run once when the component is mounted on the client
        if (typeof window !== 'undefined' && recordingCompatible === null) {
            // Check for iOS and Safari
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
            const isIOSChrome = isIOS && navigator.userAgent.includes('CriOS');
            const isIOSFirefox = isIOS && navigator.userAgent.includes('FxiOS');

            // iOS devices should use Safari
            if (isIOS && (isIOSChrome || isIOSFirefox)) {
                setRecordingCompatible(false);
                // Only show toast once to prevent infinite loop
                if (!hasShownCompatibilityToast.current) {
                    hasShownCompatibilityToast.current = true;
                    setTimeout(() => {
                        addToast({
                            title: 'Browser Not Supported',
                            description: 'Recording in Chrome or Firefox on iOS is not supported. Please use Safari instead.',
                            type: 'info',
                            duration: 8000
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
                            title: 'Microphone Access Required',
                            description: 'On iOS, recording requires microphone permission. Try opening this page directly in Safari.',
                            type: 'info',
                            duration: 8000
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
        log.error('Recording error:', error);

        // Reset recording state when an error occurs
        setIsRecording(false);

        // Show error toast with more iOS-specific help
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

        if (error.code === 'not_supported' && isIOS) {
            addToast({
                title: 'Recording Not Available',
                description: 'On iOS, please use Safari and make sure the site has microphone permissions. Try opening directly from Safari, not from an app.',
                type: 'error',
                duration: 8000
            });
        } else if (error.code === 'permission_denied') {
            addToast({
                title: 'Microphone Access Denied',
                description: 'Please allow microphone access to use recording features.',
                type: 'error',
                duration: 5000
            });
        } else {
            addToast({
                title: 'Recording Failed',
                description: error.message,
                type: 'error',
                duration: 5000
            });
        }
    };

    // Use the audio recorder hook
    const {startRecording, stopRecording} = useAudioRecorder({
        isRecording,
        EditListType: editListType,
        NoteListType: noteListType,
        onEditListChange: setEditList,
        onPlayedNotesChange: setPlayedNotes,
        refetchTypes,
        scoreId: id as string,
        notesId: score.notes_id as string,
        onError: handleRecordingError
    });

    // Handle toggling recording
    const toggleRecording = () => {
        if (isRecording) {
            log.debug('Stopping recording');
            stopRecording();
        } else {
            log.debug('Starting recording');
            startRecording();
        }
        setIsRecording(!isRecording);
    };

    // Function to show recording help toast
    const showRecordingHelp = () => {
        // Don't show toast if we've already shown one to prevent render loops
        if (hasShownCompatibilityToast.current) {
            return;
        }

        hasShownCompatibilityToast.current = true;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

        // Use setTimeout to break potential render loops
        setTimeout(() => {
            if (isIOS) {
                addToast({
                    title: 'iOS Recording Requirements',
                    description: 'Recording requires Safari browser. Please open this page directly in Safari, not from within apps like Instagram or Facebook.',
                    type: 'info',
                    duration: 8000
                });
            } else {
                addToast({
                    title: 'Recording Not Supported',
                    description: 'Your browser does not support recording. Please try a different browser like Chrome or Safari.',
                    type: 'info',
                    duration: 5000
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
    const [totalPages, setTotalPages] = useState<number | null>(null);

    // Refs
    const mouseMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const recenterButton = useRef<HTMLButtonElement>(null);
    const fetchedDataRef = useRef<boolean>(false); // Prevent duplicate API calls during React's double-render

    // Log when protobuf types are initialized
    useEffect(() => {
        if (!editListType) {
            log.warn("EditListType is not yet initialized");
            return;
        }

        log.debug("EditListType is initialized and ready to use");
    }, [editListType]);

    const onStarToggle = (score: MusicScore) => {
        setLastStarTime(Date.now());
        if (Date.now() - lastStarTime < 700) return;
        setScore({...score, starred: !score.starred});
        api.post(`/score/star/${score.id}`, {starred: !score.starred}).catch(log.error);
    }

    const {data: loadedScore, refetch} = useQuery({
        queryKey: ["score_" + id],
        queryFn: async () => {
            // Prevent duplicate API calls during StrictMode's double-render or if we already have data
            if (fetchedDataRef.current || score.id) {
                log.debug('Preventing duplicate score data fetch - using existing data');
                return score.id ? score : null;
            }

            // Mark that we've started a fetch
            fetchedDataRef.current = true;
            log.debug(`React Query fetching score data for ID: ${id}`);

            try {
                const response = await api.get<MusicScore>(`/score/data/${id}`);
                return response.data;
            } catch (error) {
                log.error('Error in React Query fetch:', error);
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    log.error(`Score with ID ${id} not found`);
                    router.push('/');
                }
                return null;
            }
        },
        staleTime: 7 * 24 * 60 * 60 * 1000, // Consider data fresh for 1 week
        gcTime: 7 * 24 * 60 * 60 * 1000,
    });

    useEffect(() => {
        if (!loadedScore) return;
        log.debug(`Setting score from React Query data: ${loadedScore.id}`);
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

    // Floating dock of controls for both fullscreen and normal mode
    const ControlDock = () => {
        // Calculate which page we're viewing based on current page (0-indexed) + 1
        const currentDisplayPage = currentPage + 1;
        const totalPages = score && score.total_pages ? score.total_pages : '?';

        // Track if we're on a small screen for responsive UI
        const [isSmallScreen, setIsSmallScreen] = useState(false);

        // Detect small screens
        useEffect(() => {
            const checkScreenSize = () => {
                setIsSmallScreen(window.innerWidth < 500);
            };

            // Check on mount and resize
            checkScreenSize();
            window.addEventListener('resize', checkScreenSize);

            return () => window.removeEventListener('resize', checkScreenSize);
        }, []);

        return (
          <div
            ref={dockRef}
            className={`absolute w-full flex justify-center bottom-8 left-1/2 transform -translate-x-1/2 transition-opacity duration-300 ${showDock ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
              <div className={`flex flex-wrap items-center bg-gray-800/50 backdrop-blur-sm rounded-full ${isSmallScreen ? 'p-2' : 'p-3'} shadow-lg max-w-[95vw] overflow-hidden`}>
                  {/* Record button with compatibility indicator */}
                  <BasicTooltip text={
                    recordingCompatible === false
                      ? "Recording not supported in this browser"
                      : isRecording
                        ? "Stop recording"
                        : "Start recording"
                  }>
                      <Button
                        onClick={recordingCompatible === false ? showRecordingHelp : toggleRecording}
                        className={`
                          ${isRecording ? 'bg-red-600' : recordingCompatible === false ? 'bg-amber-600' : 'bg-primary'} 
                          text-white 
                          ${isSmallScreen ? 'w-10 h-10' : 'w-14 h-14'} 
                          rounded-full 
                          flex items-center justify-center 
                          ${isSmallScreen ? 'mr-1' : 'mr-3'}
                          relative
                        `}
                        disabled={recordingCompatible === false}
                      >
                          {isRecording ? (
                            <SquareIcon className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/>
                          ) : recordingCompatible === false ? (
                            <AlertTriangle className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/>
                          ) : (
                            <Mic className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/>
                          )}
                      </Button>
                  </BasicTooltip>

                  {/* Previous recordings button */}
                  <BasicTooltip text="View previous recordings">
                      <Button
                        onClick={() => setShowRecordingsModal(!showRecordingsModal)}
                        variant="ghost"
                        size="icon"
                        className={`text-white ${isSmallScreen ? 'mr-1' : 'mr-3'}`}
                      >
                          <Clock className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/>
                      </Button>
                  </BasicTooltip>

                  {/* Divider */}
                  <div className={`h-10 w-px bg-gray-400 ${isSmallScreen ? 'mx-1' : 'mx-3'}`}></div>

                  {/* Previous page */}
                  <BasicTooltip text="Previous page">
                      <Button
                        onClick={goToPrevPage}
                        variant="ghost"
                        size="icon"
                        className="text-white"
                        disabled={currentPage <= 0}
                      >
                          <ArrowLeftCircle className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/>
                      </Button>
                  </BasicTooltip>

                  {/* Page counter */}
                  <div className={`${isSmallScreen ? 'px-1 text-sm' : 'px-4'} text-white font-medium whitespace-nowrap`}>
                      {currentDisplayPage} / {totalPages}
                  </div>

                  {/* Next page */}
                  <BasicTooltip text="Next page">
                      <Button
                        onClick={goToNextPage}
                        variant="ghost"
                        size="icon"
                        className={`text-white ${isSmallScreen ? 'mr-1' : 'mr-3'}`}
                      >
                          <ArrowRightCircle className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/>
                      </Button>
                  </BasicTooltip>

                  {/* Divider */}
                  <div className={`h-10 w-px bg-gray-400 ${isSmallScreen ? 'mx-1' : 'mx-3'}`}></div>

                  {/* Reset zoom button */}
                  <BasicTooltip text="Reset zoom">
                      <Button
                        variant="ghost"
                        size="icon"
                        ref={recenterButton}
                        className={`text-white ${isSmallScreen ? 'mr-1' : 'mr-3'}`}
                      >
                          <Fullscreen className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/>
                      </Button>
                  </BasicTooltip>

                  {/* Fullscreen toggle */}
                  <BasicTooltip text={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleFullscreen}
                        className={`text-white ${isSmallScreen ? 'mr-1' : 'mr-3'}`}
                      >
                          {isFullscreen ? <Minimize2 className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/> : <Maximize2 className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/>}
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
                            {showDock ? <EyeOff className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/> : <Eye className={`${isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}`}/>}
                        </Button>
                    </BasicTooltip>
                  )}
              </div>

              {/* Recordings modal - appears above the button */}
              {showRecordingsModal && (
                <div
                  className={`absolute bottom-20 ${isSmallScreen ? 'left-2 right-2 w-auto' : 'left-[calc(25%)] w-64'} bg-gray-800/50 backdrop-blur-sm text-white rounded-lg shadow-lg p-4`}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
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
        // Track if we're on a small screen for responsive UI
        const [isSmallScreen, setIsSmallScreen] = useState(false);

        // Detect small screens
        useEffect(() => {
            const checkScreenSize = () => {
                setIsSmallScreen(window.innerWidth < 500);
            };

            // Check on mount and resize
            checkScreenSize();
            window.addEventListener('resize', checkScreenSize);

            return () => window.removeEventListener('resize', checkScreenSize);
        }, []);

        return <div
          className={`absolute top-0 left-0 right-0 z-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onMouseEnter={() => setShowControls(true)}
        >
            <div
              className={`flex items-center justify-between ${isSmallScreen ? 'p-2' : 'p-4'} bg-white ${isFullscreen ? "dark:bg-gray-800" : "dark:bg-inherit"}`}>
                <div className="flex gap-2 place-items-center overflow-hidden">
                    {isFullscreen ? (
                      <Button variant="ghost" size="icon" onClick={toggleFullscreen} className={isSmallScreen ? 'h-8 w-8 mr-1' : ''}>
                          <Minimize2 className={isSmallScreen ? 'h-4 w-4' : 'h-5 w-5'}/>
                      </Button>
                    ) : (
                      <Link href="/" className="text-muted-foreground">
                          <ArrowLeft className={isSmallScreen ? 'h-4 w-4' : 'h-6 w-6'}/>
                      </Link>
                    )}
                    <p className={`${isFullscreen ? 'text-xl text-white dark:text-white' : 'text-2xl'} ${isSmallScreen ? 'text-sm' : ''} ml-1 truncate`}>
                        {score.title}
                        {score.subtitle && !isSmallScreen && (
                          <span
                            className={`${isFullscreen ? 'text-gray-300 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'} ml-2`}>
                                {score.subtitle}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-x-1">
                    <BasicTooltip text="Download">
                        <Button
                          variant="ghost"
                          onClick={() => window.open(`/score/download/${score.id}`)}
                          className={isSmallScreen ? 'h-8 w-8' : ''}
                        >
                            <Download className={isSmallScreen ? 'h-3 w-3' : 'h-4 w-4'}/>
                        </Button>
                    </BasicTooltip>
                    <BasicTooltip text="Star">
                        <Button 
                          variant="ghost" 
                          onClick={() => onStarToggle(score)}
                          className={isSmallScreen ? 'h-8 w-8' : ''}
                        >
                            <Star
                              className={`${isSmallScreen ? 'h-3 w-3' : 'size-4'} ${score.starred ? "text-yellow-400 fill-yellow-400" : isFullscreen ? "text-white" : "text-black dark:text-white"}`}/>
                        </Button>
                    </BasicTooltip>
                    {!isFullscreen && (
                      <BasicTooltip text="Enter fullscreen">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={toggleFullscreen}
                            className={isSmallScreen ? 'h-8 w-8' : ''}
                          >
                              <Maximize2 className={isSmallScreen ? 'h-3 w-3' : 'h-4 w-4'}/>
                          </Button>
                      </BasicTooltip>
                    )}
                    {!isFullscreen && !isSmallScreen && (
                      <NotImplementedTooltip>
                          <Button 
                            variant="ghost" 
                            disabled
                            className={isSmallScreen ? 'h-8 w-8' : ''}
                          >
                              <Share2 className={isSmallScreen ? 'h-3 w-3' : 'h-4 w-4'}/>
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
                        retry={() => {
                          log.debug('Retry requested for MusicXMLRenderer, limiting frequency');
                          // Debounce the refetch to prevent request spam
                          if (window.lastRefetchTime && Date.now() - window.lastRefetchTime < 5000) {
                            log.debug('Skipping refetch due to rate limiting');
                            return;
                          }
                          window.lastRefetchTime = Date.now();
                          refetch();
                        }}
                        isFullscreen={isFullscreen}
                        currentPage={currentPage}
                        pagesPerView={1}
                      /> :
                      <ImageScoreRenderer
                        scoreId={score.id}
                        recenter={recenterButton}
                        retry={() => {
                          log.debug('Retry requested for ImageScoreRenderer, limiting frequency');
                          // Debounce the refetch to prevent request spam
                          if (window.lastRefetchTime && Date.now() - window.lastRefetchTime < 5000) {
                            log.debug('Skipping refetch due to rate limiting');
                            return;
                          }
                          window.lastRefetchTime = Date.now();
                          refetch();
                        }}
                        isFullscreen={isFullscreen}
                        currentPage={currentPage}
                        pagesPerView={1}
                      />
                  ) : ""}

                  {/* Control dock */}
                  <ControlDock/>

                  {/* Debug panel - only render on client side */}
                  {isClient && isDebugMode && (
                    <DebugPanel
                      scoreId={id as string}
                      editList={editList}
                      setEditList={setEditList}
                      playedNotes={playedNotes}
                      scoreNotes={scoreNotes}
                      currentPage={currentPage}
                      editsOnPage={editsOnPage}
                      setPlayedNotes={setPlayedNotes}
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
                        retry={() => {
                          log.debug('Retry requested for MusicXMLRenderer, limiting frequency');
                          // Debounce the refetch to prevent request spam
                          if (window.lastRefetchTime && Date.now() - window.lastRefetchTime < 5000) {
                            log.debug('Skipping refetch due to rate limiting');
                            return;
                          }
                          window.lastRefetchTime = Date.now();
                          refetch();
                        }}
                        currentPage={currentPage}
                        pagesPerView={1}
                      /> :
                      <ImageScoreRenderer
                        scoreId={score.id}
                        recenter={recenterButton}
                        retry={() => {
                          log.debug('Retry requested for ImageScoreRenderer, limiting frequency');
                          // Debounce the refetch to prevent request spam
                          if (window.lastRefetchTime && Date.now() - window.lastRefetchTime < 5000) {
                            log.debug('Skipping refetch due to rate limiting');
                            return;
                          }
                          window.lastRefetchTime = Date.now();
                          refetch();
                        }}
                        currentPage={currentPage}
                        pagesPerView={1}
                      />
                  ) : ""}

                  {/* Control dock */}
                  <ControlDock/>

                  {/* Debug panel - only render on client side */}
                  {isClient && isDebugMode && (
                    <DebugPanel
                      scoreId={id as string}
                      editList={editList}
                      setEditList={setEditList}
                      playedNotes={playedNotes}
                      scoreNotes={scoreNotes}
                      currentPage={currentPage}
                      editsOnPage={editsOnPage}
                      setPlayedNotes={setPlayedNotes}
                    />
                  )}
              </div>
          </div>
      </Layout>
    );
}
