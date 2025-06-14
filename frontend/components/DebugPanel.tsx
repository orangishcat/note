"use client";

import React, { useEffect, useRef, useState } from "react";
import { Message } from "protobufjs";
import ComparisonDialog from "@/components/ComparisonDialog";
import log from "@/lib/logger";
import { splitCombinedResponse } from "@/lib/audio-recorder";
import api from "@/lib/network";
import { initProtobufTypes } from "@/lib/proto";

interface DebugPanelProps {
  scoreId: string;
  editList: Message | null;
  setEditList: (e: Message | null) => void;
  playedNotes: Message | null;
  scoreNotes: Message | null;
  currentPage: number;
  editsOnPage: number;
  setPlayedNotes: (p: Message | null) => void;
  confidenceFilter: number;
  setConfidenceFilter: (v: number) => void;
}

const TestTypeSelector = ({
  isOpen,
  onClose,
  onSelectTestType,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectTestType: (t: string) => void;
}) => {
  if (!isOpen) return null;
  const testTypes = [
    { id: "spider_dance_actual", name: "Spider Dance Actual" },
    { id: "spider_dance_played", name: "Spider Dance Played" },
  ];
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-4 shadow-lg max-w-md w-full">
        <h3 className="text-white text-lg font-semibold mb-4">
          Select Test Type
        </h3>
        <div className="space-y-2">
          {testTypes.map((type) => (
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

const DebugPanel = ({
  scoreId,
  editList,
  setEditList,
  playedNotes,
  scoreNotes,
  currentPage,
  editsOnPage,
  setPlayedNotes,
  confidenceFilter,
  setConfidenceFilter,
}: DebugPanelProps) => {
  const [position, setPosition] = useState<{
    x: number;
    y: number;
  }>(
    JSON.parse(
      localStorage.getItem("debugPanelPosition") || '{"x":20,"y":100}',
    ),
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);
  const [showNoteNames, setShowNoteNames] = useState(false);
  const [showComparisonDialog, setShowComparisonDialog] = useState(false);
  const [showTestTypeSelector, setShowTestTypeSelector] = useState(false);
  const [currentTestType, setCurrentTestType] = useState("spider_dance_played");
  const [comparisonData, setComparisonData] = useState<{
    note: any;
    targetNote?: any;
    editOperation?: string;
    position?: number;
  }>({ note: null });
  const [comparisonNoteCount, setComparisonNoteCount] = useState<number>(15);
  const [localConf, setLocalConf] = useState(confidenceFilter);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (testStatus) {
      const timer = setTimeout(() => setTestStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [testStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedPosition = localStorage.getItem("debugPanelPosition");
      if (savedPosition) setPosition(JSON.parse(savedPosition));
      const savedShowNoteNames = localStorage.getItem("debugShowNoteNames");
      if (savedShowNoteNames) setShowNoteNames(savedShowNoteNames === "true");
      const savedCnt = localStorage.getItem("debugComparisonNoteCount");
      if (savedCnt) setComparisonNoteCount(parseInt(savedCnt, 10));
    } catch (e) {
      log.error("Error loading debug panel position:", e);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (position.x || position.y) {
      localStorage.setItem("debugPanelPosition", JSON.stringify(position));
    }
  }, [position]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("debugShowNoteNames", String(showNoteNames));
    if (editList) redrawAnnotations();
    const event = new CustomEvent("debug:toggleNoteNames", {
      detail: { showNoteNames },
      bubbles: true,
    });
    document.dispatchEvent(event);
  }, [showNoteNames]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      "debugComparisonNoteCount",
      String(comparisonNoteCount),
    );
    const event = new CustomEvent("debug:updateComparisonNoteCount", {
      detail: { comparisonNoteCount },
      bubbles: true,
    });
    document.dispatchEvent(event);
  }, [comparisonNoteCount]);

  const handleComparisonNoteCountChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 1 && v <= 50) setComparisonNoteCount(v);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y,
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const toggleNoteNames = () => setShowNoteNames(!showNoteNames);

  const sendTestRequest = async (e?: React.MouseEvent) => {
    if (isSendingTest) return;
    if (e && e.shiftKey) {
      setShowTestTypeSelector(true);
      return;
    }
    setIsSendingTest(true);
    setTestStatus(null);

    try {
      try {
        log.debug(`Sending test audio request with type: ${currentTestType}`);
        const emptyAudioBlob = new Blob([new Uint8Array([1])]);
        const response = await api.post("/audio/receive", emptyAudioBlob, {
          headers: {
            "Content-Type": "audio/webm",
            "X-Score-ID": scoreId,
            "X-Test-Type": currentTestType,
          },
          responseType: "arraybuffer",
        });
        if (response.status !== 200)
          throw new Error(`Server returned status ${response.status}`);
        const { ScoringResultType, NoteListType } = await initProtobufTypes();
        if (!ScoringResultType || !NoteListType)
          throw new Error("Failed to initialize ScoringResultType or NoteListType");
        const buffer = response.data;
        const dataView = new Uint8Array(buffer);

        // Log first few bytes for debugging
        const firstBytes = Array.from(dataView.slice(0, 20))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");
        log.debug(`First bytes of buffer: ${firstBytes}`);

        // Check for combined format
        const responseFormat = response.headers?.["x-response-format"];
        if (responseFormat === "combined") {
          log.debug("Detected combined response format");

          // Use the splitCombinedResponse utility to decode both parts
          const { editList, playedNotes: receivedPlayedNotes } =
            splitCombinedResponse(buffer, ScoringResultType, NoteListType);

          if (editList) {
            const editCount = (editList as any).edits?.length || 0;
            log.debug(
              `Successfully decoded test response with ${editCount} edits`,
            );
            // Clone to prevent mutation of the original message
            const cloned = JSON.parse(JSON.stringify(editList));
            setEditList(cloned);

            // Also update played notes if available
            if (receivedPlayedNotes) {
              const noteCount = (receivedPlayedNotes as any).notes?.length || 0;
              log.debug(
                `Successfully decoded test response with ${noteCount} played notes`,
              );
              setPlayedNotes(receivedPlayedNotes);
            }

            // Set success status message
            setTestStatus({
              message: `Success! Received ${editCount} edits and ${
                (receivedPlayedNotes as any)?.notes?.length || 0
              } notes`,
              isError: false,
            });
          } else {
            throw new Error("Failed to decode EditList from combined response");
          }
        } else {
          // Legacy format - just decode EditList
          log.debug("Using legacy format (ScoringResult only)");
          const decoded = ScoringResultType.decode(dataView);
          const editCount = (decoded as any).edits?.length || 0;
          log.debug(
            `Successfully decoded test response with ${editCount} edits`,
          );

          // Update the edit list with a cloned object
          const cloned = JSON.parse(JSON.stringify(decoded));
          setEditList(cloned);

          // Set success status message
          setTestStatus({
            message: `Success! Received ${editCount} edits`,
            isError: false,
          });
        }
      } catch (error) {
        log.error("Error decoding test response:", error);
        setTestStatus({
          message: `Error decoding response: ${
            error instanceof Error ? error.message : String(error)
          }`,
          isError: true,
        });
      }
    } catch (error) {
      log.error("Error sending test request:", error);
      setTestStatus({
        message: `Request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const renderTestStatus = () => {
    if (!testStatus) return null;
    return (
      <div
        className={`text-xs mt-2 p-1 rounded ${
          testStatus.isError
            ? "bg-red-900/50 text-red-200"
            : "bg-green-900/50 text-green-200"
        }`}
      >
        {testStatus.message}
      </div>
    );
  };

  const redrawAnnotations = () => {
    if (!editList) {
      log.warn("No annotations to redraw");
      return;
    }
    const temp = editList;
    setEditList(null);
    setTimeout(() => {
      setEditList(temp);
      const event = new CustomEvent("score:redrawAnnotations", {
        detail: { scoreId, currentPage },
        bubbles: true,
      });
      document.dispatchEvent(event);
    }, 50);
  };

  const disableDebugMode = () => {
    localStorage.removeItem("debug");
    window.dispatchEvent(new Event("storage"));
  };

  useEffect(() => {
    const handleShowComparison = (event: Event) => {
      const { note, targetNote, editOperation, isTarget, position } = (
        event as CustomEvent
      ).detail;
      setComparisonData({
        note: isTarget ? targetNote : note,
        targetNote: isTarget ? note : targetNote,
        editOperation,
        position,
      });
      setShowComparisonDialog(true);
    };
    document.addEventListener("edit:showComparison", handleShowComparison);
    return () =>
      document.removeEventListener("edit:showComparison", handleShowComparison);
  }, []);

  const closeComparisonDialog = () => setShowComparisonDialog(false);

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-black/70 text-white p-3 rounded-md shadow-lg"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: "13rem",
        cursor: isDragging ? "grabbing" : "default",
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="absolute top-0 left-0 right-0 h-7 bg-gray-700/80 rounded-t-md flex items-center px-2 cursor-grab"
        onMouseDown={handleMouseDown}
      >
        <div className="grid grid-cols-3 gap-1 mr-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-gray-400" />
          ))}
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
        <button
          onClick={toggleNoteNames}
          className={`${
            showNoteNames ? "bg-purple-600" : "bg-gray-600"
          } hover:${
            showNoteNames ? "bg-purple-700" : "bg-gray-700"
          } text-white text-xs px-2 py-1 rounded`}
        >
          {showNoteNames ? "Hide Note Names" : "Show Note Names"}
        </button>
        <button
          onClick={sendTestRequest}
          disabled={isSendingTest}
          className={`${
            isSendingTest ? "bg-green-800" : "bg-green-600 hover:bg-green-700"
          } text-white text-xs px-2 py-1 rounded flex items-center justify-center`}
        >
          {isSendingTest ? <>Processing...</> : "Send Test Request"}
        </button>
        <button
          onClick={disableDebugMode}
          className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded"
        >
          Disable Debug Mode
        </button>
        {renderTestStatus()}
        <div className="text-xs mt-2">
          <p>Page: {currentPage}</p>
          <p>
            Edits: {editsOnPage}/
            {editList ? (editList as any).edits?.length || 0 : 0}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            <label className="text-gray-300 text-xs flex justify-between items-center">
              <span>Comparison Note Count:</span>
              <span className="text-white font-mono">
                {comparisonNoteCount}
              </span>
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
          <div className="mt-2 flex flex-col gap-1">
            <label className="text-gray-300 text-xs flex justify-between items-center">
              <span>Min Confidence:</span>
              <span className="text-white font-mono">{localConf}</span>
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={localConf}
              onChange={(e) => setLocalConf(parseInt(e.target.value, 10))}
              onMouseUp={() => {
                setConfidenceFilter(localConf);
                redrawAnnotations();
              }}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>1</span>
              <span>3</span>
              <span>5</span>
            </div>
          </div>
        </div>
      </div>
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
      <TestTypeSelector
        isOpen={showTestTypeSelector}
        onClose={() => setShowTestTypeSelector(false)}
        onSelectTestType={(t) => {
          setCurrentTestType(t);
          setShowTestTypeSelector(false);
          sendTestRequest();
        }}
      />
    </div>
  );
};

export default DebugPanel;
