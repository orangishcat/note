"use client"

import {useParams} from "next/navigation"
import {createContext, useContext, useEffect, useRef, useState} from "react"
import Link from "next/link"
import {ArrowLeft, Download, Fullscreen, Mic, Share2, SquareIcon, Star} from "lucide-react"
import {Button} from "@/components/ui/button"
import {Layout} from "@/components/layout"
import MusicXMLRenderer, {MusicScore} from "@/components/music-xml-renderer"
import {Get, Post} from "@/lib/network"
import NotImplementedTooltip from "@/components/ui-custom/not-implemented-tooltip"
import {useQuery} from "@tanstack/react-query"
import BasicTooltip from "@/components/ui-custom/basic-tooltip"


interface ScoringContextType {
    notes: []
    setNotes: (notes: []) => void
}

const ScoringContext = createContext<ScoringContextType | null>(null)

export default function ScorePage() {
    const params = useParams()
    const id = params.id as string
    const [score, setScore] = useState<MusicScore>({
        id: "",
        title: "loading",
        subtitle: "you're not supposed to be seeing this. if you are, good for you.",
        upload_date: "now",
    })
    const [lastStarTime, setLastStarTime] = useState(0)
    const [processedData, setProcessedData] = useState<object | null>(null)

    const onStarToggle = (score: MusicScore) => {
        setLastStarTime(Date.now())
        if (Date.now() - lastStarTime < 700) return
        setScore({...score, starred: !score.starred})
        Post(`/api/score/star/${score.id}`, {starred: !score.starred}).catch(console.error)
    }

    const {data: loadedScore} = useQuery({
        queryKey: ["score_" + id],
        queryFn: () => Get<MusicScore>(`/api/score/data/${id}`)
    })

    useEffect(() => {
        if (loadedScore) setScore(loadedScore)
    }, [loadedScore])

    const recenterButton = useRef<HTMLButtonElement>(null)
    const notesCont = useContext(ScoringContext)

    // Recording state and refs
    const [intervalId, setIntervalId] = useState<ReturnType<typeof setInterval> | null>(null)
    const [isRecording, setIsRecording] = useState(false)
    const [recorder, setRecorder] = useState<MediaRecorder | null>(null);

    const toggleRecording = async () => {
        setIsRecording(!isRecording)
        if (!isRecording) {
            recorder?.stop();
            setRecorder(null)
            return
        }

        const stream = await navigator.mediaDevices.getUserMedia({audio: true})
        const length = 8000;

        function record() {
            // Create a new MediaRecorder for the stream.
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
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
            const silenceThreshold = 0.01; // Adjust this threshold as needed

            // Process audio data to detect silence.
            processor.addEventListener("audioprocess", (event) => {
                const inputData = event.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);
                const currentTime = Date.now();

                // Check if the current audio level is below the silence threshold.
                if (rms < silenceThreshold) {
                    // Start counting silence if not already started.
                    if (silenceStart === null) {
                        silenceStart = currentTime;
                    } else if (currentTime - silenceStart >= 4000 && currentTime - startTime >= 8000) {
                        // 4 seconds of silence and recording length over 8s detected: stop the recorder.
                        mediaRecorder.stop();
                    }
                } else {
                    // Reset silence detection if audio level rises above threshold.
                    silenceStart = null;
                }
            })

            // When the recorder stops, send the data to the server and restart recording if needed.
            mediaRecorder.onstop = () => {
                // Clean up audio processing nodes.
                processor.disconnect();
                sourceNode.disconnect();
                audioContext.close();

                fetch("/api/audio/receive", {
                    method: "POST",
                    body: new Blob(chunks),
                    headers: {"Content-Type": "audio/webm;codecs=opus"}
                })
                  .then(async (data) => {
                      const obj = await data.json();
                      console.log(obj);
                      setProcessedData(obj);
                      for (const note of obj) {
                          notesCont?.notes.push(note as never);
                      }
                      // Restart the recorder if still recording.
                      if (isRecording) {
                          record();
                      }
                  })
                  .catch(console.error);
            };

            mediaRecorder.start();
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        function recordInterval() {
            function record_and_send() {
                record()
                if (!recorder) throw new Error("recorder missing")
                setTimeout(() => recorder.stop(), length); // we'll have a 8s media file
                recorder.start();
            }

            if (intervalId) clearInterval(intervalId)
            if (!isRecording) {// generate a new file every 8s
                setIntervalId(setInterval(record_and_send, length));
            } else {
                setProcessedData(null);
            }
        }

        record()
    }

    return (
      <Layout>
          <div className="flex items-center justify-between p-4">
              <div className="flex gap-2 place-items-center">
                  <Link href="/" className="text-muted-foreground">
                      <ArrowLeft className="h-6 w-6"/>
                  </Link>
                  <p className="text-2xl">
                      {score.title}
                      <span className="text-gray-500 dark:text-gray-400"> ({score.subtitle})</span>
                  </p>
              </div>
              <div className="flex items-center gap-x-2">
                  <BasicTooltip text="Reset zoom">
                      <Button variant="ghost" size="icon" ref={recenterButton}>
                          <Fullscreen className="h-5 w-5"/>
                      </Button>
                  </BasicTooltip>
                  <BasicTooltip text="Download">
                      <Button
                        variant="ghost"
                        onClick={() =>
                          window.open(
                            `/api/score/download/${score.file_id}?filename=${encodeURIComponent(score.title + ".mxl")}`
                          )
                        }
                      >
                          <Download className="h-4 w-4"/>
                      </Button>
                  </BasicTooltip>
                  <BasicTooltip text="Star">
                      <Button variant="ghost" onClick={() => onStarToggle(score)}>
                          <Star
                            className={"size-4 " + (score.starred ? "text-yellow-400 fill-yellow-400" : "text-black dark:text-white")}/>
                      </Button>
                  </BasicTooltip>
                  <NotImplementedTooltip>
                      <Button variant="ghost" disabled>
                          <Share2 className="h-4 w-4"/>
                      </Button>
                  </NotImplementedTooltip>
              </div>
          </div>
          <div className="p-4 space-y-4 relative">
              {score && score.id && score.file_id ? (
                <MusicXMLRenderer scoreFileID={score.file_id} recenter={recenterButton}/>
              ) : ""}
              <div className="absolute bottom-[50px] left-1/2 transform -translate-x-1/2">
                  <Button
                    onClick={toggleRecording}
                    className="bg-primary text-white w-20 h-20 rounded-full flex items-center justify-center text-lg"
                  >
                      {isRecording ? <SquareIcon className="h-8 w-8"/> : <Mic className="h-8 w-8"/>}
                  </Button>
              </div>
              {processedData && (
                <div className="fixed top-[100px] right-[100px] bg-gray-50 dark:bg-gray-800 p-4 rounded-lg"><h3
                  className="text-lg font-bold">Processed Audio Data</h3>
                    <ul>
                        {Object.entries(processedData).map(([key, value]) => (
                          <li key={key}>
                              <strong>{key}:</strong> {value}
                          </li>
                        ))}
                    </ul>
                </div>
              )}
          </div>
      </Layout>
    )
}

export {ScoringContext}
