import React, {useEffect, useRef, useState} from 'react';
import {Message} from 'protobufjs';
import {midiPitchToNoteName} from '@/lib/edit-display';
import log from '@/lib/logger';

// Types for the comparison dialog props
interface ComparisonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  note: any; // Source note
  targetNote?: any; // Target note (for substitutions)
  editOperation?: string; // Operation type as string (INSERT, DELETE, SUBSTITUTE)
  position?: number; // Position of the edit in the sequence
  playedNotes?: Message | null; // The played notes from recording
  scoreNotes?: Message | null; // The original score notes
  // Note: displayCount (notes to show on each side) is loaded from localStorage 'debugComparisonNoteCount'
  // and updated via 'debug:updateComparisonNoteCount' events from the debug panel
}

// Position types
type Position = {
  x: number;
  y: number;
};

// Helper function to get notes around a position
function getNotesAroundPosition(
  notes: any[] | null,
  position: number | undefined,
  count: number = 10,
  isTarget: boolean = false
): any[] {
  if (!notes || notes.length === 0) {
    log.debug('getNotesAroundPosition: No notes provided or empty array');
    return [];
  }

  if (position === undefined) {
    log.debug('getNotesAroundPosition: Position is undefined');
    // If position is undefined, return the first few notes as a fallback
    return notes.slice(0, count).map((note, idx) => ({
      ...note,
      relativePosition: idx,
      absolutePosition: idx // Add absolute position
    }));
  }

  // Handle position being out of range
  const validPosition = Math.max(0, Math.min(notes.length - 1, position));
  if (validPosition !== position) {
    log.debug(`Position ${position} adjusted to valid position ${validPosition}`);
  }

  const startIdx = Math.max(0, validPosition - count);
  const endIdx = Math.min(notes.length - 1, validPosition + count);

  return notes.slice(startIdx, endIdx + 1).map((note, idx) => ({
    ...note,
    relativePosition: idx - (validPosition - startIdx), // Relative to the edit position
    absolutePosition: startIdx + idx, // Absolute position in the original array
    isSourcePosition: !isTarget && startIdx + idx === position,
    isTargetPosition: isTarget && startIdx + idx === position
  }));
}

// Helper to round durations to 5 decimal places
function roundDuration(duration: number | undefined): string {
  if (duration === undefined) return 'N/A';
  return duration.toFixed(5);
}

// Function to deeply inspect object to find t_pos
const inspectForTargetPos = (obj: any, path = ''): string[] => {
  if (!obj || typeof obj !== 'object') return [];

  const results: string[] = [];

  // Check this level for fields that might be target position
  for (const key of Object.keys(obj)) {
    const val = obj[key];

    // If the field contains "pos" and has a numeric value, or is just named t_pos
    if ((key.toLowerCase().includes('pos') || key === 't_pos') && typeof val === 'number') {
      results.push(`${path}${key}: ${val}`);
    }

    // Recurse if the value is an object (and not too deep)
    if (typeof val === 'object' && val !== null && path.split('.').length < 3) {
      const childResults = inspectForTargetPos(val, `${path}${key}.`);
      results.push(...childResults);
    }
  }

  return results;
};

const ComparisonDialog: React.FC<ComparisonDialogProps> = ({
                                                             isOpen,
                                                             onClose,
                                                             note,
                                                             targetNote,
                                                             editOperation,
                                                             position: editPosition,
                                                             playedNotes,
                                                             scoreNotes
                                                           }) => {
  const [dialogPosition, setDialogPosition] = useState<Position>({x: 0, y: 0});
  const [isDragging, setIsDragging] = useState(false);
  const [displayCount, setDisplayCount] = useState<number>(15); // Default to 15 notes on each side
  const dragStart = useRef<Position>({x: 0, y: 0});
  const dialogRef = useRef<HTMLDivElement>(null);
  const scoreNotesContainerRef = useRef<HTMLDivElement>(null);
  const playedNotesContainerRef = useRef<HTMLDivElement>(null);
  const activeScoreNoteRef = useRef<HTMLDivElement>(null);
  const activePlayedNoteRef = useRef<HTMLDivElement>(null);

  log.debug('ComparisonDialog props:', {
    note,
    targetNote,
    editOperation,
    position: editPosition
  });

  // Add detailed props debug on open
  useEffect(() => {
    if (isOpen) {
      log.debug('ComparisonDialog opened with props:', {
        noteJSON: note ? JSON.stringify(note) : null,
        targetNoteJSON: targetNote ? JSON.stringify(targetNote) : null,
        editOperation,
        position: editPosition,
        isDeleteOp: editOperation === 'DELETE'
      });
    }
  }, [isOpen, note, targetNote, editOperation, editPosition]);

  // Listen for display count updates from debug panel
  useEffect(() => {
    // Load the initial count from localStorage if available
    try {
      const savedCount = localStorage.getItem('debugComparisonNoteCount');
      if (savedCount) {
        const parsedCount = parseInt(savedCount, 10);
        if (!isNaN(parsedCount) && parsedCount > 0) {
          setDisplayCount(parsedCount);
        }
      }
    } catch (e) {
      log.error('Error loading comparison note count from localStorage:', e);
    }

    const handleUpdateComparisonNoteCount = (event: Event) => {
      const customEvent = event as CustomEvent;
      const {comparisonNoteCount} = customEvent.detail;
      if (typeof comparisonNoteCount === 'number') {
        setDisplayCount(comparisonNoteCount);
      }
    };

    document.addEventListener('debug:updateComparisonNoteCount', handleUpdateComparisonNoteCount);

    return () => {
      document.removeEventListener('debug:updateComparisonNoteCount', handleUpdateComparisonNoteCount);
    };
  }, []);

  // Extract notes from protobuf messages safely
  const extractNotes = (messageObj: Message | null | undefined): any[] => {
    if (!messageObj) return [];

    // Try different ways to access notes
    try {
      // First try direct access as any
      const directNotes = (messageObj as any).notes;
      if (Array.isArray(directNotes)) {
        log.debug('Found notes via direct access', {count: directNotes.length});
        return directNotes;
      }

      // Try using toJSON if available
      if (typeof messageObj.toJSON === 'function') {
        const jsonObj = messageObj.toJSON();
        log.debug('Message converted to JSON:', jsonObj);

        if (jsonObj && Array.isArray(jsonObj.notes)) {
          log.debug('Found notes via toJSON', {count: jsonObj.notes.length});
          return jsonObj.notes;
        }
      }

      // Try accessing as object with get method
      if (typeof (messageObj as any).get === 'function') {
        const notesViaGet = (messageObj as any).get('notes');
        if (Array.isArray(notesViaGet)) {
          log.debug('Found notes via get method', {count: notesViaGet.length});
          return notesViaGet;
        }
      }

      // Log the structure to help debug
      log.warn('Could not extract notes from message object:', messageObj);
      return [];
    } catch (error) {
      log.error('Error extracting notes:', error);
      return [];
    }
  };

  // Log the structure of message objects
  if (scoreNotes) {
    log.debug('scoreNotes structure:', {
      isMessage: true,
      hasToJSON: typeof (scoreNotes as any).toJSON === 'function',
      keys: Object.keys(scoreNotes)
    });
  }

  if (playedNotes) {
    log.debug('playedNotes structure:', {
      isMessage: true,
      hasToJSON: typeof (playedNotes as any).toJSON === 'function',
      keys: Object.keys(playedNotes)
    });
  }

  // Extract the notes
  const scoreNotesArray = extractNotes(scoreNotes);
  const playedNotesArray = extractNotes(playedNotes);

  // Debug prints for source note and target note
  log.debug('Source note details:', {
    note,
    editPosition,
    tPos: note?.tPos,
    t_pos: note?.t_pos,
    sChar: note?.sChar,
    hasSourceNote: !!note,
    fields: note ? Object.keys(note) : [],
    editOperation
  });

  log.debug('Target note details:', {
    targetNote,
    tPos: targetNote?.tPos,
    t_pos: targetNote?.t_pos,
    hasTargetNote: !!targetNote,
    fields: targetNote ? Object.keys(targetNote) : []
  });

  // Log all potential target positions in the note object
  if (editOperation === 'DELETE') {
    const posFields = inspectForTargetPos(note);
    log.debug('All potential target position fields in DELETE operation note:', {
      posFields,
      noteJSON: JSON.stringify(note).substring(0, 200) + '...'  // Truncated for readability
    });
  }

  // Function to safely find target position
  const findTargetPosition = (): number | undefined => {
    if (editOperation === 'DELETE') {
      // For DELETE operations, check all possible locations
      if (note?.t_pos !== undefined) return note.t_pos;
      if (note?.sChar?.t_pos !== undefined) return note.sChar.t_pos;
      if (note?.tPos !== undefined) return note.tPos;
      if (note?.pos !== undefined && note?.pos !== editPosition) return note.pos;
      if (note?.position !== undefined && note?.position !== editPosition) return note.position;

      // Check numeric fields
      const posFields = inspectForTargetPos(note);
      if (posFields.length > 0) {
        log.debug('Found potential target position fields:', {posFields});

        // Get the first field that contains "t_pos" or "tpos"
        const tPosField = posFields.find(field =>
          field.toLowerCase().includes('t_pos') ||
          field.toLowerCase().includes('tpos') ||
          field.toLowerCase().includes('target'));

        if (tPosField) {
          const value = Number(tPosField.split(':')[1].trim());
          if (!isNaN(value)) {
            log.debug(`Using field ${tPosField} with value ${value} as target position`);
            return value;
          }
        }
      }

      // Log that we couldn't find the target position
      log.warn('Could not find target position for DELETE operation', {
        editOperation,
        noteKeys: note ? Object.keys(note) : [],
        hasNote: !!note,
      });

      // Default to same as edit position for DELETE
      return editPosition;
    } else if (editOperation === 'SUBSTITUTE' || editOperation === 'INSERT') {
      // For SUBSTITUTE/INSERT, prefer target note's position
      if (targetNote?.t_pos !== undefined) return targetNote.t_pos;
      if (targetNote?.tPos !== undefined) return targetNote.tPos;

      // Fallback to source note's target positions
      if (note?.t_pos !== undefined) return note.t_pos;
      if (note?.tPos !== undefined) return note.tPos;

      // Default to same as edit position for these operations
      return editPosition;
    }

    // Default case, just use edit position
    return editPosition;
  };

  // Calculate positions
  const sourcePosition = editPosition;
  const targetPosition = findTargetPosition();

  // Debug the found positions
  log.debug('Position detection result:', {
    sourcePosition,
    targetPosition,
    editOperation,
    hasNote: !!note,
    hasTargetNote: !!targetNote
  });

  // Get notes around the position - use displayCount notes on each side
  const scoreNotesContext = getNotesAroundPosition(scoreNotesArray, editPosition, displayCount, false);
  const playedNotesContext = getNotesAroundPosition(playedNotesArray, targetPosition, displayCount, true);

  // Log note contexts for debugging
  useEffect(() => {
    if (isOpen) {
      log.debug('Score notes extracted:', {count: scoreNotesArray.length});
      log.debug('Played notes extracted:', {count: playedNotesArray.length});
      log.debug('Score notes context:', {
        count: scoreNotesContext.length,
        requestedCount: displayCount,
        data: scoreNotesContext
      });
      log.debug('Played notes context:', {
        count: playedNotesContext.length,
        requestedCount: displayCount,
        data: playedNotesContext
      });
    }
  }, [isOpen, scoreNotesArray, playedNotesArray, scoreNotesContext, playedNotesContext]);

  // Initialize dialog position at center of viewport
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dialogWidth = dialogRef.current.offsetWidth;
      const dialogHeight = dialogRef.current.offsetHeight;

      setDialogPosition({
        x: (viewportWidth - dialogWidth) / 2,
        y: (viewportHeight - dialogHeight) / 2
      });
    }
  }, [isOpen]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle dragging functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - dialogPosition.x,
      y: e.clientY - dialogPosition.y
    };
  };

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setDialogPosition({
          x: e.clientX - dragStart.current.x,
          y: e.clientY - dragStart.current.y
        });
      }
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

  // After notes are rendered, center the active notes in view
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the DOM has been rendered
      const timer = setTimeout(() => {
        if (activeScoreNoteRef.current) {
          activeScoreNoteRef.current.scrollIntoView({
            behavior: 'auto',
            block: 'nearest',
            inline: 'center'
          });
        }

        if (activePlayedNoteRef.current) {
          activePlayedNoteRef.current.scrollIntoView({
            behavior: 'auto',
            block: 'nearest',
            inline: 'center'
          });
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isOpen, scoreNotesContext, playedNotesContext]);

  // If not open, don't render anything
  if (!isOpen) return null;

  // Get note information
  const sourceNoteName = note?.pitch !== undefined ? midiPitchToNoteName(note.pitch) : 'Unknown';
  const targetNoteName = targetNote?.pitch !== undefined ? midiPitchToNoteName(targetNote.pitch) : 'Unknown';

  // Get semitone difference for substitutions
  let semitonesDiff = 0;
  let diffDirection = '';

  if (editOperation === 'SUBSTITUTE' && targetNote?.pitch !== undefined && note?.pitch !== undefined) {
    semitonesDiff = targetNote.pitch - note.pitch;
    diffDirection = semitonesDiff > 0 ? '▲' : '▼'; // Up or down arrow
  }

  // Helper function to render a note in the sequence
  const renderNoteInSequence = (note: any, index: number, isHighlighted: boolean = false) => {
    const noteName = note?.pitch !== undefined ? midiPitchToNoteName(note.pitch) : 'N/A';
    const position = note.relativePosition;
    const isCurrentPosition = position === 0;

    return (
      <div
        key={index}
        className={`p-2 rounded flex items-center justify-between border ${
          isHighlighted
            ? 'bg-blue-900/70 border-blue-700'
            : isCurrentPosition
              ? 'bg-gray-800/90 border-gray-700'
              : 'bg-gray-900/70 border-gray-800'
        } ${isCurrentPosition ? 'font-bold' : ''}`}
      >
        <div className="flex items-center">
          <span className={`w-6 text-center ${isCurrentPosition ? 'text-white' : 'text-gray-400'}`}>
            {position}
          </span>
          <span className="ml-2 font-mono">{noteName}</span>
        </div>
        <div className="text-xs text-gray-400">
          {note.startTime.toFixed(3)}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={dialogRef}
      className="fixed z-50 bg-black/90 text-white p-4 rounded-md shadow-lg"
      style={{
        left: `${dialogPosition.x}px`,
        top: `${dialogPosition.y}px`,
        minWidth: '300px',
        maxWidth: '500px',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        cursor: isDragging ? 'grabbing' : 'default'
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div
        className="absolute top-0 left-0 right-0 h-8 bg-gray-800/90 rounded-t-md flex items-center px-3 cursor-grab"
        onMouseDown={handleMouseDown}
      >
        <div className="grid grid-cols-3 gap-1 mr-2">
          <div className="w-1 h-1 rounded-full bg-gray-300"></div>
          <div className="w-1 h-1 rounded-full bg-gray-300"></div>
          <div className="w-1 h-1 rounded-full bg-gray-300"></div>
        </div>
        <span className="text-sm font-semibold text-white">Note Comparison</span>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-2 top-1 text-gray-300 hover:text-white"
          aria-label="Close dialog"
        >
          ✕
        </button>
      </div>

      <div className="mt-8 p-2">
        {/* Operation type */}
        <div className="mb-4">
          <span className="text-gray-300">Operation:</span>
          <span className={`ml-2 font-bold px-2 py-1 rounded ${
            editOperation === 'INSERT' ? 'bg-green-800 text-green-100' :
              editOperation === 'DELETE' ? 'bg-red-800 text-red-100' :
                editOperation === 'SUBSTITUTE' ? 'bg-orange-800 text-orange-100' :
                  'bg-gray-700'
          }`}>
            {editOperation || 'Unknown'}
          </span>
          {editPosition !== undefined && (
            <span className="ml-2 text-gray-300">
              at position <span className="font-mono text-white">{editPosition}</span>
            </span>
          )}
        </div>

        {/* Source note details */}
        <div className="mb-3 p-3 bg-gray-800/80 rounded border border-gray-700">
          <h3 className="font-bold text-sm mb-1 text-white">Source Note</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-300">Pitch:</span>
              <span className="ml-2 text-white">{note?.pitch !== undefined ? note.pitch : 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-300">Note:</span>
              <span className="ml-2 font-mono text-white">{sourceNoteName}</span>
            </div>
            <div>
              <span className="text-gray-300">Page:</span>
              <span className="ml-2 text-white">{note?.page !== undefined ? note.page : 'N/A'}</span>
            </div>
            {note?.duration !== undefined && (
              <div>
                <span className="text-gray-300">Duration:</span>
                <span className="ml-2 text-white">{roundDuration(note.duration)}</span>
              </div>
            )}
            <div>
              <span className="text-gray-300">Position:</span>
              <span className="ml-2 text-white">{editPosition !== undefined ? editPosition : 'N/A'}</span>
            </div>
            {note?.tPos !== undefined && (
              <div>
                <span className="text-gray-300">Target Position:</span>
                <span className="ml-2 text-white">{note.tPos}</span>
              </div>
            )}
          </div>
        </div>

        {/* Target position info for DELETE operations */}
        {editOperation === 'DELETE' && (
          <div className="mb-3 p-3 rounded border bg-red-900/60 border-red-800">
            <h3 className="font-bold text-sm mb-1 text-white">Deletion Info</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-300">Source Position:</span>
                <span className="ml-2 text-white">{editPosition !== undefined ? editPosition : 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-300">Target Position:</span>
                <span
                  className="ml-2 text-white">{targetPosition !== undefined ? targetPosition : 'N/A'}</span>
              </div>
              <div className="col-span-2 mt-1">
                            <span
                              className="text-gray-300">Note missing from performance at position {targetPosition}</span>
              </div>
            </div>
          </div>
        )}

        {/* Target note details (for substitutions and inserts) */}
        {(editOperation === 'SUBSTITUTE' || editOperation === 'INSERT') && targetNote && (
          <div className={`mb-3 p-3 rounded border ${
            editOperation === 'SUBSTITUTE' ? 'bg-blue-900/60 border-blue-800' :
              editOperation === 'INSERT' ? 'bg-green-900/60 border-green-800' :
                'bg-gray-800/80 border-gray-700'
          }`}>
            <h3 className="font-bold text-sm mb-1 text-white">Target Note</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-300">Pitch:</span>
                <span
                  className="ml-2 text-white">{targetNote?.pitch !== undefined ? targetNote.pitch : 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-300">Note:</span>
                <span className="ml-2 font-mono text-white">{targetNoteName}</span>
              </div>
              {targetNote?.duration !== undefined && (
                <div>
                  <span className="text-gray-300">Duration:</span>
                  <span className="ml-2 text-white">{roundDuration(targetNote.duration)}</span>
                </div>
              )}
              <div>
                <span className="text-gray-300">Position:</span>
                <span className="ml-2 text-white">
                  {targetNote.t_pos !== undefined ? targetNote.t_pos : 'N/A'}
                </span>
              </div>
            </div>

            {/* Difference information */}
            <div className="mt-2 p-2 bg-gray-900/90 rounded text-sm border border-gray-700">
              <span className="text-gray-300">Pitch Difference:</span>
              <span className="ml-2 text-white">
                {Math.abs(semitonesDiff)} semitones {diffDirection}
                <span className="ml-2 font-mono">
                  ({sourceNoteName} → {targetNoteName})
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Note sequence comparison */}
        {(scoreNotesContext.length > 0 || playedNotesContext.length > 0) && (
          <div className="mb-3 mt-5">
            <div className="overflow-x-auto pb-2">
              <div className="min-w-max">
                {/* Score notes context - top row */}
                {scoreNotesContext.length > 0 && (
                  <div className="mb-2">
                    <h4
                      className="text-xs uppercase tracking-wider text-gray-300 mb-2 text-center">Original
                      Score</h4>
                    <div ref={scoreNotesContainerRef} className="flex space-x-1 overflow-x-auto pb-2">
                      <div className="flex-1"></div>
                      {scoreNotesContext.map((note, index) => (
                        <div
                          key={index}
                          ref={note.relativePosition === 0 ? activeScoreNoteRef : null}
                          className={`p-2 rounded flex flex-col items-center justify-center border min-w-[50px] ${
                            note.relativePosition === 0
                              ? 'bg-gray-800/90 border-gray-700 font-bold'
                              : 'bg-gray-900/70 border-gray-800'
                          }`}
                        >
                          <span
                            className={`text-center ${note.relativePosition === 0 ? 'text-white' : 'text-gray-400'}`}>
                            {note.absolutePosition !== undefined ? note.absolutePosition : index}
                          </span>
                          <span className="font-mono text-xs mt-1">
                            {note?.pitch !== undefined ? midiPitchToNoteName(note.pitch) : 'N/A'}
                          </span>
                          <span className="text-xs text-gray-400 mt-1">
                            {note.startTime.toFixed(3)}
                          </span>
                          {/* Visual indicator for alignment - if this is the source note of an edit */}
                          {note.relativePosition === 0 && (
                            <div className={`w-4 h-4 mt-1 rounded-full ${
                              editOperation === 'DELETE' ? 'bg-red-600' :
                                editOperation === 'SUBSTITUTE' ? 'bg-orange-600' : 'bg-gray-600'
                            }`}></div>
                          )}
                        </div>
                      ))}
                      <div className="flex-1"></div>
                    </div>
                  </div>
                )}

                {/* Visual connector between score and played notes */}
                {editOperation && (
                  <div className="h-10 relative my-2">
                    <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -ml-0.5
                      bg-gradient-to-b from-gray-600 to-gray-500"></div>
                    {editOperation === 'SUBSTITUTE' && (
                      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2
                        bg-orange-600 text-white text-xs px-2 py-1 rounded-full">
                        {editOperation}
                      </div>
                    )}
                    {editOperation === 'DELETE' && (
                      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2
                        bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                        {editOperation}
                      </div>
                    )}
                    {editOperation === 'INSERT' && (
                      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2
                        bg-green-600 text-white text-xs px-2 py-1 rounded-full">
                        {editOperation}
                      </div>
                    )}
                  </div>
                )}

                {/* Played notes context - bottom row */}
                {(playedNotesContext.length > 0 || editOperation === 'DELETE') && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-gray-300 mb-2 text-center">Played
                      Notes</h4>
                    <div ref={playedNotesContainerRef} className="flex space-x-1 overflow-x-auto pb-2">
                      <div className="flex-1"></div>

                      {/* Handle delete operation with no played notes */}
                      {editOperation === 'DELETE' && playedNotesContext.length === 0 && (
                        <div
                          ref={activePlayedNoteRef}
                          className="p-2 rounded flex flex-col items-center justify-center border min-w-[50px] bg-red-900/70 border-red-700"
                        >
                          <span className="text-center text-white">
                            {targetPosition !== undefined ? targetPosition : '?'}
                          </span>
                          <span className="font-mono text-xs mt-1 text-red-300">
                            Missing
                          </span>
                          <span className="text-xs text-gray-400 mt-1">
                            —
                          </span>
                          <div className="w-4 h-4 mt-1 rounded-full bg-red-600"></div>
                        </div>
                      )}

                      {playedNotesContext.map((note, index) => (
                        <div
                          key={index}
                          ref={note.relativePosition === 0 ? activePlayedNoteRef : null}
                          className={`p-2 rounded flex flex-col items-center justify-center border min-w-[50px] ${
                            editOperation === 'SUBSTITUTE' && note.relativePosition === 0
                              ? 'bg-blue-900/70 border-blue-700'
                              : editOperation === 'INSERT' && note.relativePosition === 0
                                ? 'bg-green-900/70 border-green-700'
                                : editOperation === 'DELETE' && note.relativePosition === 0
                                  ? 'bg-red-900/70 border-red-700'
                                  : note.relativePosition === 0
                                    ? 'bg-gray-800/90 border-gray-700 font-bold'
                                    : 'bg-gray-900/70 border-gray-800'
                          }`}
                        >
                          <span
                            className={`text-center ${note.relativePosition === 0 ? 'text-white' : 'text-gray-400'}`}>
                            {note.absolutePosition !== undefined ? note.absolutePosition : index}
                          </span>
                          <span className="font-mono text-xs mt-1">
                            {note?.pitch !== undefined ? midiPitchToNoteName(note.pitch) : 'N/A'}
                          </span>
                          <span className="text-xs text-gray-400 mt-1">
                            {note.startTime.toFixed(3)}
                          </span>
                          {/* Visual indicator for alignment - if this is the target note of an edit */}
                          {note.relativePosition === 0 && (
                            <div className={`w-4 h-4 mt-1 rounded-full ${
                              editOperation === 'INSERT' ? 'bg-green-600' :
                                editOperation === 'SUBSTITUTE' ? 'bg-blue-600' :
                                  editOperation === 'DELETE' ? 'bg-red-600' :
                                    'bg-gray-600'
                            }`}></div>
                          )}
                        </div>
                      ))}
                      <div className="flex-1"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bottom action buttons */}
        <div className="flex justify-end mt-3">
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComparisonDialog; 