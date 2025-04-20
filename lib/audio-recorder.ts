import { useRef, useState, useEffect } from 'react';
import { Message, Type } from 'protobufjs';
import log from './logger';

export interface AudioRecorderHookProps {
    isRecording: boolean;
    EditListType: Type | null;
    onEditListChange: (editList: Message | null) => void;
    refetchTypes: () => Promise<Type | null>;
    scoreId: string;
}

export function useAudioRecorder({
    isRecording,
    EditListType,
    onEditListChange,
    refetchTypes,
    scoreId
}: AudioRecorderHookProps) {
    const isRecordingRef = useRef<boolean>(false);
    const streamRef = useRef<MediaStream | null>(null);
    const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
    const setupInProgressRef = useRef<boolean>(false);
    const lastRequestTimeRef = useRef<number>(0);
    const MIN_REQUEST_INTERVAL = 2000; // Minimum 2 seconds between requests

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
                // Request microphone access only once
                if (!streamRef.current) {
                    streamRef.current = await navigator.mediaDevices.getUserMedia({audio: true});
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

                // Create media recorder
                mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm;codecs=opus'
                });

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

                    // Process the recorded audio
                    try {
                        const response = await fetch("/api/audio/receive", {
                            method: "POST",
                            body: new Blob(chunks),
                            headers: {
                                "Content-Type": "audio/webm;codecs=opus",
                                "X-Score-ID": scoreId
                            }
                        });

                        if (!response.ok) {
                            log.error(`Error from server: ${response.status} ${response.statusText}`);
                            setupInProgressRef.current = false;
                            
                            // Only start a new recording session if still recording
                            if (isRecordingRef.current) {
                                setTimeout(() => setupRecorder(), 100);
                            }
                            return;
                        }

                        const buffer = await response.arrayBuffer();
                        log.debug(`Received buffer of size: ${buffer.byteLength} bytes`);

                        // Check if EditListType is initialized before decoding
                        let currentEditListType = EditListType;
                        if (!currentEditListType) {
                            log.warn("EditListType not initialized, attempting to refetch protobuf types");
                            currentEditListType = await refetchTypes();

                            // If still not initialized after refetch, throw error
                            if (!currentEditListType) {
                                throw new Error("EditListType still not initialized after refetch");
                            }

                            log.debug("EditListType successfully initialized after refetch");
                        }

                        try {
                            log.debug("Using EditListType:", currentEditListType);
                            
                            // Safely decode the protobuf data
                            try {
                                // Create a proper Uint8Array from the buffer
                                const dataView = new Uint8Array(buffer);
                                
                                // Log first few bytes for debugging
                                const firstBytes = Array.from(dataView.slice(0, 20))
                                    .map(b => b.toString(16).padStart(2, '0'))
                                    .join(' ');
                                log.debug(`First bytes of buffer: ${firstBytes}`);
                                
                                // Decode using the type
                                const decoded = currentEditListType.decode(dataView);
                                log.debug("Successfully decoded protobuf data");
                                
                                // Pass the decoded message to state
                                onEditListChange(decoded);
                            } catch (decodeError) {
                                log.error("Error decoding protobuf data:", decodeError);
                                
                                // Try to recover by refetching types
                                const updatedType = await refetchTypes();
                                if (updatedType) {
                                    try {
                                        log.debug("Attempting decode with refreshed types");
                                        const dataView = new Uint8Array(buffer);
                                        const decoded = updatedType.decode(dataView);
                                        onEditListChange(decoded);
                                        log.debug("Successfully decoded with refreshed types");
                                    } catch (retryError) {
                                        log.error("Failed to decode even with refreshed types:", retryError);
                                        throw retryError;
                                    }
                                } else {
                                    throw decodeError;
                                }
                            }
                        } catch (e) {
                            log.error("Error decoding edit list:", e);
                            // Error already handled, just ensure we move on
                        }
                    } catch (error) {
                        log.error("Error processing recorded audio:", error);
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

                // Store recorder in state and start recording
                setRecorder(mediaRecorder);
                mediaRecorder.start();
                log.debug("Recording started");
            } catch (error) {
                log.error("Error setting up recorder:", error);
                setupInProgressRef.current = false;

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
            }
            setRecorder(null);
            setupInProgressRef.current = false;
        }

        // Clean up on unmount or when dependencies change
        return () => {
            cleanupAudioResources();
            setupInProgressRef.current = false;
        };
    }, [isRecording, refetchTypes, recorder, EditListType, onEditListChange, scoreId]);

    return {
        recorder,
        isRecordingRef,
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
                }
            }
        }
    };
}
