import { useRef, useState, useEffect } from 'react';
import { Message, Type } from 'protobufjs';
import log from './logger';
import axios from 'axios';
import api from "@/lib/network";

// Utility function to split combined protocol buffer response
export function splitCombinedResponse(
  buffer: ArrayBuffer,
  EditListType: Type,
  NoteListType: Type
): { editList: Message | null, playedNotes: Message | null } {
  try {
    const dataView = new Uint8Array(buffer);

    // Extract the size prefix (first 4 bytes)
    const editListSizeBytes = dataView.slice(0, 4);
    const editListSize = new DataView(editListSizeBytes.buffer).getUint32(0, false); // Big-endian

    log.debug(`EditList size: ${editListSize} bytes`);

    // Extract EditList data
    const editListData = dataView.slice(4, 4 + editListSize);

    // Extract NoteList data (everything after EditList)
    const playedNotesData = dataView.slice(4 + editListSize);

    // Decode both messages
    const editList = EditListType.decode(editListData);
    const playedNotes = NoteListType.decode(playedNotesData);

    log.debug(`Successfully decoded: EditList with ${(editList as any).edits?.length || 0} edits, ` +
              `NoteList with ${(playedNotes as any).notes?.length || 0} notes`);

    return { editList, playedNotes };
  } catch (error) {
    log.error("Error splitting combined response:", error);
    return { editList: null, playedNotes: null };
  }
}

// Error type for exposing recording errors to the UI
export interface RecordingError {
  message: string;
  code?: string;
  details?: any;
}

export interface AudioRecorderHookProps {
    isRecording: boolean;
    EditListType: Type | null;
    NoteListType: Type | null;
    onEditListChange: (editList: Message | null) => void;
    onPlayedNotesChange: (playedNotes: Message | null) => void;
    refetchTypes: () => Promise<{ EditListType: Type | null, NoteListType: Type | null }>;
    scoreId: string;
    notesId: string
    onError?: (error: RecordingError) => void;
}

export function useAudioRecorder({
    isRecording,
    EditListType,
    NoteListType,
    onEditListChange,
    onPlayedNotesChange,
    refetchTypes,
    scoreId,
    notesId,
    onError
}: AudioRecorderHookProps) {
    const isRecordingRef = useRef<boolean>(false);
    const streamRef = useRef<MediaStream | null>(null);
    const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
    const setupInProgressRef = useRef<boolean>(false);
    const lastRequestTimeRef = useRef<number>(0);
    const MIN_REQUEST_INTERVAL = 2000; // Minimum 2 seconds between requests
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);

    // Handle the error and propagate it to the UI if callback is provided
    const handleError = (error: any, context: string) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`${context}: ${errorMessage}`, error);

        const recordingError: RecordingError = {
            message: `Recording failed: ${errorMessage}`,
            details: error
        };

        // Add error code for permission errors
        if (errorMessage.includes('Permission') || 
            errorMessage.includes('permission') || 
            errorMessage.includes('denied')) {
            recordingError.code = 'permission_denied';
            recordingError.message = 'Microphone access was denied. Please allow microphone access to record.';
        }

        // Add error code for not supported errors (specific to iOS Safari limitations)
        if (errorMessage.includes('NotSupported') || 
            errorMessage.includes('not supported') || 
            errorMessage.includes('not implemented') ||
            errorMessage.includes('undefined is not an object') ||
            errorMessage.includes('mediaDevices')) {
            recordingError.code = 'not_supported';
            recordingError.message = 'Recording is not supported in this browser or requires permission. Make sure to use Safari on iOS and grant microphone access.';
        }

        if (onError) {
            onError(recordingError);
        }

        // Reset recording state
        setRecorder(null);
        setupInProgressRef.current = false;
        isRecordingRef.current = false;
    };

    // Update ref whenever isRecording changes
    useEffect(() => {
        isRecordingRef.current = isRecording;

        // Clean up when component unmounts
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, [isRecording]);

    // Function to check browser compatibility
    const checkBrowserCompatibility = (): { supported: boolean; message?: string } => {
        // Check if navigator.mediaDevices is available
        if (!navigator.mediaDevices) {
            return { 
                supported: false, 
                message: 'Audio recording is not supported in this browser. For iOS devices, please use Safari and ensure the site has microphone permissions.'
            };
        }

        // Check if getUserMedia is available
        if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
            return {
                supported: false,
                message: 'getUserMedia is not supported in this browser. For iOS devices, please use Safari and ensure the site has microphone permissions.'
            };
        }

        // Check if MediaRecorder is available
        if (typeof MediaRecorder === 'undefined') {
            return { 
                supported: false, 
                message: 'MediaRecorder is not supported in this browser.'
            };
        }

        // Additional iOS checks
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

        if (isIOS) {
            // iOS requires HTTPS for microphone access
            if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                return {
                    supported: false,
                    message: 'On iOS devices, recording requires HTTPS. Please access this site via a secure connection.'
                };
            }

            // Check if we're on iOS Chrome or iOS Firefox (which have limitations)
            if (navigator.userAgent.includes('CriOS') || navigator.userAgent.includes('FxiOS')) {
                return {
                    supported: false,
                    message: 'Recording in Chrome or Firefox on iOS is not supported. Please use Safari instead.'
                };
            }
        }

        // WebM with opus might not be supported in all browsers, especially Safari
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        if (isSafari) {
            // Safari has limited MediaRecorder support
            try {
                // Check if the MediaRecorder API supports any audio MIME type
                const supportedTypes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];
                const isSupported = supportedTypes.some(type => {
                    try {
                        return MediaRecorder.isTypeSupported(type);
                    } catch (e) {
                        return false;
                    }
                });

                if (!isSupported) {
                    return {
                        supported: false,
                        message: 'Your browser does not support any of the required audio formats.'
                    };
                }
            } catch (error) {
                return {
                    supported: false,
                    message: 'Error checking MediaRecorder support in your browser.'
                };
            }
        }

        return { supported: true };
    };

    // Handle recorder setup only when isRecording changes from false to true
    useEffect(() => {
        let mediaRecorder: MediaRecorder | null = null;
        let processorNode: ScriptProcessorNode | null = null;
        let audioContext: AudioContext | null = null;
        let sourceNode: MediaStreamAudioSourceNode | null = null;
        let isAudioContextClosed = false;

        // Skip everything if recorder setup is already in progress
        if (setupInProgressRef.current) {
            return;
        }

        // Safe function to close AudioContext that prevents "Cannot close a closed AudioContext" error
        const safeCloseAudioContext = async () => {
            if (audioContext && !isAudioContextClosed) {
                try {
                    await audioContext.close();
                    isAudioContextClosed = true;
                } catch (error) {
                    isAudioContextClosed = true;
                    log.debug("AudioContext was already closed");
                }
            }
        };

        // Safe function to clean up audio resources
        const cleanupAudioResources = async () => {
            if (processorNode) {
                try {
                    processorNode.disconnect();
                } catch (error) {
                    log.debug("Error disconnecting processor node:", error);
                }
                processorNode = null;
            }

            if (sourceNode) {
                try {
                    sourceNode.disconnect();
                } catch (error) {
                    log.debug("Error disconnecting source node:", error);
                }
                sourceNode = null;
            }

            await safeCloseAudioContext();
        };

        const setupRecorder = async () => {
            // Skip if not recording or setup is already in progress
            if (!isRecording || setupInProgressRef.current || recorder) {
                return;
            }

            setupInProgressRef.current = true;
            log.debug("Setting up recorder");

            try {
                // Check browser compatibility first
                const compatibility = checkBrowserCompatibility();
                if (!compatibility.supported) {
                    throw new Error(compatibility.message);
                }

                // Request microphone access with proper error handling for iOS Safari
                if (!streamRef.current) {
                    try {
                        // Check explicitly for iOS Safari getUserMedia availability
                        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
                            throw new Error('Media devices or getUserMedia not available. On iOS, ensure you are using Safari and have granted microphone permissions.');
                        }

                        streamRef.current = await navigator.mediaDevices.getUserMedia({audio: true});
                        setHasPermission(true);
                    } catch (error) {
                        setHasPermission(false);

                        // Log specific details about the error
                        if (!navigator.mediaDevices) {
                            log.error('navigator.mediaDevices is undefined');
                        } else if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
                            log.error('navigator.mediaDevices.getUserMedia is not a function');
                        }

                        throw error;
                    }
                }

                const stream = streamRef.current;

                // Clean up any existing audio resources before creating new ones
                await cleanupAudioResources();

                // Reset closed flag for new AudioContext
                isAudioContextClosed = false;

                // Create audio context
                audioContext = new AudioContext();
                sourceNode = audioContext.createMediaStreamSource(stream);
                processorNode = audioContext.createScriptProcessor(4096, 1, 1);
                sourceNode.connect(processorNode);
                processorNode.connect(audioContext.destination);

                // When creating media recorder with the supported mime type
                try {
                    let mimeType = 'audio/webm;codecs=opus';

                    // On iOS Safari, prefer MP4
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
                    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

                    if (isIOS || isSafari) {
                        if (MediaRecorder.isTypeSupported('audio/mp4')) {
                            mimeType = 'audio/mp4';
                        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
                            mimeType = 'audio/aac';
                        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                            mimeType = 'audio/webm';
                        }
                    } else if (!MediaRecorder.isTypeSupported(mimeType)) {
                        if (MediaRecorder.isTypeSupported('audio/mp4')) {
                            mimeType = 'audio/mp4';
                        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                            mimeType = 'audio/ogg;codecs=opus';
                        }
                    }

                    try {
                        mediaRecorder = new MediaRecorder(stream, {
                            mimeType: mimeType
                        });
                        log.debug(`Created MediaRecorder with mimeType: ${mimeType}`);
                    } catch (e) {
                        // Fallback to default options if the specified mime type isn't supported
                        log.warn(`Failed to create MediaRecorder with mimeType ${mimeType}, falling back to default`);
                        mediaRecorder = new MediaRecorder(stream);
                    }
                } catch (e) {
                    log.error('Error creating MediaRecorder:', e);
                    throw e;
                }

                const chunks: BlobPart[] = [];
                mediaRecorder.ondataavailable = (e) => {
                    chunks.push(e.data);
                };

                // Variables to track recording start time and silence duration
                const startTime = Date.now();
                let silenceStart: number | null = null;
                const silenceThreshold = 0.01;

                // Listen for audio process events to detect silence
                processorNode.addEventListener("audioprocess", (event) => {
                    if (!isRecordingRef.current || !mediaRecorder) return;

                    const inputData = event.inputBuffer.getChannelData(0);
                    let sum = 0;
                    for (let i = 0; i < inputData.length; i++) {
                        sum += inputData[i] * inputData[i];
                    }
                    const rms = Math.sqrt(sum / inputData.length);
                    const currentTime = Date.now();

                    if (rms < silenceThreshold) {
                        if (silenceStart === null) {
                            silenceStart = currentTime;
                        } else if (currentTime - silenceStart >= 4000 && currentTime - startTime >= 8000) {
                            mediaRecorder.stop();
                        }
                    } else {
                        silenceStart = null;
                    }
                });

                // Handle recording stop
                mediaRecorder.onstop = async () => {
                    log.debug("Recorder stopped");

                    // Clean up audio resources
                    await cleanupAudioResources();

                    // Set recorder to null in state
                    setRecorder(null);

                    // Check if enough time has passed since last request
                    const currentTime = Date.now();
                    if (currentTime - lastRequestTimeRef.current < MIN_REQUEST_INTERVAL) {
                        log.debug("Skipping request due to rate limiting");
                        setupInProgressRef.current = false;

                        // Only start a new recording session if still recording
                        if (isRecordingRef.current) {
                            log.debug("Starting new recording session after rate limit");
                            setTimeout(() => setupRecorder(), 100);
                        }
                        return;
                    }

                    lastRequestTimeRef.current = currentTime;

                    // Check if we have any audio data
                    if (chunks.length === 0 || chunks.every(chunk => (chunk as Blob).size === 0)) {
                        log.warn("No audio data captured in recording");
                        setupInProgressRef.current = false;

                        // Notify error if callback exists
                        if (onError) {
                            onError({
                                message: "No audio was captured. Please try again.",
                                code: "no_audio_data"
                            });
                        }

                        // Only start a new recording session if still recording
                        if (isRecordingRef.current) {
                            setTimeout(() => setupRecorder(), 100);
                        }
                        return;
                    }

                    // Process the recorded audio
                    try {
                        if (!mediaRecorder) throw new Error("MediaRecorder is null");
                        const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
                        log.debug(`Created audio blob of type ${mediaRecorder.mimeType} and size ${blob.size} bytes`);

                        const response = await api.post("/audio/receive", blob, {
                            headers: {
                                "Content-Type": mediaRecorder.mimeType,
                                "X-Score-ID": scoreId,
                                "X-Notes-ID": notesId
                            },
                            responseType: 'arraybuffer'
                        });

                        const buffer = response.data;
                        log.debug(`Received buffer of size: ${buffer.byteLength} bytes`);

                        // Check if EditListType is initialized before decoding
                        let currentEditListType = EditListType;
                        let currentNoteListType = NoteListType;

                        if (!currentEditListType || !currentNoteListType) {
                            log.warn("Protocol buffer types not initialized, attempting to refetch");
                            const result = await refetchTypes();
                            currentEditListType = result.EditListType;
                            currentNoteListType = result.NoteListType;

                            // If still not initialized after refetch, throw error
                            if (!currentEditListType || !currentNoteListType) {
                                throw new Error("Protocol buffer types still not initialized after refetch");
                            }

                            log.debug("Protocol buffer types successfully initialized after refetch");
                        }

                        try {
                            log.debug("Using protocol buffer types for decoding");

                            // Check for new combined format
                            const responseFormat = response.headers['x-response-format'];
                            if (responseFormat === 'combined') {
                                log.debug("Detected combined response format");

                                const { editList, playedNotes } = splitCombinedResponse(
                                    buffer,
                                    currentEditListType,
                                    currentNoteListType
                                );

                                if (editList) {
                                    onEditListChange(editList);
                                } else {
                                    log.error("Failed to decode EditList from combined response");
                                }

                                if (playedNotes) {
                                    onPlayedNotesChange(playedNotes);
                                } else {
                                    log.error("Failed to decode PlayedNotes from combined response");
                                }
                            } else {
                                // Legacy format - just EditList
                                const dataView = new Uint8Array(buffer);
                                const decoded = currentEditListType.decode(dataView);
                                log.debug("Successfully decoded legacy format (EditList only)");
                                onEditListChange(decoded);
                            }
                        } catch (decodeError) {
                            log.error("Error decoding protobuf data:", decodeError);

                            // Try to recover by refetching types
                            const updatedType = await refetchTypes();
                            if (updatedType && updatedType.EditListType) {
                                try {
                                    log.debug("Attempting decode with refreshed types");
                                    const dataView = new Uint8Array(buffer);
                                    const decoded = updatedType.EditListType.decode(dataView);
                                    onEditListChange(decoded || null);
                                    log.debug("Successfully decoded with refreshed types");
                                } catch (retryError) {
                                    log.error("Failed to decode even with refreshed types:", retryError);
                                    throw retryError;
                                }
                            } else {
                                throw decodeError;
                            }
                        }
                    } catch (error) {
                        if (axios.isAxiosError(error)) {
                            const statusCode = error.response?.status;
                            const statusText = error.response?.statusText;
                            const errorData = error.response?.data;

                            let errorMessage = `Error from server: ${statusCode} ${statusText}`;
                            if (errorData && typeof errorData === 'string') {
                                errorMessage += ` - ${errorData}`;
                            }

                            log.error(errorMessage, error);

                            if (onError) {
                                onError({
                                    message: errorMessage,
                                    code: "server_error",
                                    details: error
                                });
                            }
                        } else {
                            log.error("Error processing recorded audio:", error);

                            // Notify error if callback exists
                            if (onError) {
                                onError({
                                    message: error instanceof Error ? error.message : "Error processing recording",
                                    code: "processing_error",
                                    details: error
                                });
                            }
                        }
                    } finally {
                        setupInProgressRef.current = false;

                        // Only start a new recording session if still recording and with a delay
                        if (isRecordingRef.current) {
                            log.debug("Starting new recording session");
                            // Use setTimeout to prevent immediate restart
                            setTimeout(() => setupRecorder(), 100);
                        }
                    }
                };

                // Error handler for MediaRecorder
                mediaRecorder.onerror = (event) => {
                    handleError(event, "MediaRecorder error");
                };

                // Store recorder in state and start recording
                setRecorder(mediaRecorder);
                mediaRecorder.start();
                log.debug("Recording started");
            } catch (error) {
                handleError(error, "Error setting up recorder");

                // Clean up resources on error
                await cleanupAudioResources();
            }
        };

        // Set up recorder when isRecording becomes true
        if (isRecording && !recorder) {
            log.debug("Starting recorder because isRecording = true and no active recorder");
            setupRecorder();
        } else if (!isRecording && recorder) {
            // Stop recorder when isRecording becomes false
            try {
                log.debug("Stopping recorder due to isRecording change");
                recorder.stop();
            } catch (e) {
                log.error("Error stopping recorder:", e);
                if (onError) {
                    onError({
                        message: "Error stopping recording",
                        code: "stop_error",
                        details: e
                    });
                }
            }
            setRecorder(null);
            setupInProgressRef.current = false;
        }

        // Clean up on unmount or when dependencies change
        return () => {
            cleanupAudioResources();
            setupInProgressRef.current = false;
        };
    }, [isRecording, refetchTypes, recorder, EditListType, NoteListType, onEditListChange, onPlayedNotesChange, scoreId, onError]);

    return {
        recorder,
        isRecordingRef,
        hasPermission,
        startRecording: () => {
            log.debug("startRecording called");
        },
        stopRecording: () => {
            log.debug("stopRecording called");
            if (recorder && recorder.state === "recording") {
                try {
                    recorder.stop();
                } catch (e) {
                    log.error("Error stopping recorder:", e);
                    if (onError) {
                        onError({
                            message: "Error stopping recording",
                            code: "stop_error",
                            details: e
                        });
                    }
                }
            }
        }
    };
}
