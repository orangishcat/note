import { useRef, useState, useEffect } from 'react';
import { Message, Type } from 'protobufjs';
import log from './logger';
import { EditOperation } from './edit-display';

export interface AudioRecorderHookProps {
    isRecording: boolean;
    notes: Message | null;
    EditListType: Type | null;
    onEditListChange: (editList: Message | null) => void;
    refetchTypes: () => Promise<unknown>;
}

export function useAudioRecorder({
    isRecording,
    notes,
    EditListType,
    onEditListChange,
    refetchTypes
}: AudioRecorderHookProps) {
    const isRecordingRef = useRef<boolean>(false);
    const [recorder, setRecorder] = useState<MediaRecorder | null>(null);

    // Update ref whenever isRecording changes
    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    // Main recording effect
    useEffect(() => {
        (async () => {
            if (!isRecording) {
                // If we have a recorder, stop it
                if (recorder) {
                    try {
                        log.info("Stopping recorder");
                        recorder.stop();
                    } catch (e) {
                        log.error("Error stopping recorder:", e);
                    }
                    setRecorder(null);
                }
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({audio: true})

            function record() {
                // Create a new MediaRecorder for the stream.
                const mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm;codecs=opus'
                });

                // Store the recorder immediately in state
                setRecorder(mediaRecorder);

                const chunks: BlobPart[] = [];
                mediaRecorder.ondataavailable = (e) => {
                    chunks.push(e.data);
                };

                // Set up an AudioContext to analyze the audio input.
                const audioContext = new AudioContext();
                const sourceNode = audioContext.createMediaStreamSource(stream);
                const processor = audioContext.createScriptProcessor(4096, 1, 1);
                sourceNode.connect(processor);
                processor.connect(audioContext.destination);

                // Variables to track recording start time and silence duration.
                const startTime = Date.now();
                let silenceStart: number | null = null;
                const silenceThreshold = 0.01;

                // Process audio data to detect silence.
                processor.addEventListener("audioprocess", (event) => {
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
                })

                mediaRecorder.start();
                mediaRecorder.onstop = () => {
                    processor.disconnect();
                    sourceNode.disconnect();
                    audioContext.close();

                    fetch("/api/audio/receive", {
                        method: "POST",
                        body: new Blob(chunks),
                        headers: {"Content-Type": "audio/webm;codecs=opus"}
                    })
                      .then(async (data) => {
                          const buffer = await data.arrayBuffer();
                          if (!EditListType) throw new Error("EditListType not initialized");
                          try {
                            onEditListChange(EditListType.decode(new Uint8Array(buffer)));
                          }
                          catch (e) {
                            log.error("Error decoding edit list:", e);
                            refetchTypes().catch(log.error);
                          }
                      })
                      .catch(log.error);

                    // Only restart recording if still in recording state
                    log.debug("isRecording:", isRecordingRef.current);
                    if (isRecordingRef.current) {
                        log.info("Restarting recording");
                        record();
                    }
                };
            }

            record()
        })();
    }, [isRecording, notes, EditListType, onEditListChange, refetchTypes, recorder]);

    return {
        recorder,
        isRecordingRef
    };
}

export function updateNotesWithEdits(notes: Message | null, editList: Message | null): Message | null {
    if (!notes || !editList) return notes;
    
    try {
        const noteList = notes as any;
        for (const edit of (editList as any).edits) {
            const note = edit.operation === EditOperation.INSERT ? edit.tChar : edit.sChar;
            noteList.notes.push(note);
        }
        return noteList;
    } catch (error) {
        log.error('Error updating notes with edits:', error);
        return notes;
    }
} 