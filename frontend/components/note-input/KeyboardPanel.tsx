"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GripHorizontal, Minus, Plus } from "lucide-react";
import { MidiNumbers } from "react-piano";
import { Button } from "@/components/ui/button";
import KeyboardInput from "./KeyboardInput";

interface KeyboardPanelProps {
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
  disabled?: boolean;
  ready: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const LOWER_SEQUENCE = "q2w3er5t6y7u";
const UPPER_SEQUENCE = "zsxdcvgbhnm,.";
const MIN_OCTAVE = 1;
const MAX_OCTAVE = 6;

const KeyboardPanel: React.FC<KeyboardPanelProps> = ({
  onNoteOn,
  onNoteOff,
  disabled,
  ready,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState(() => {
    if (typeof window === "undefined") {
      return { x: 24, y: 24 };
    }
    const initialY = Math.max(24, window.innerHeight - 360);
    return { x: 24, y: initialY };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [baseOctave, setBaseOctave] = useState(3);

  const decrementOctave = useCallback(() => {
    setBaseOctave((prev) => Math.max(MIN_OCTAVE, prev - 1));
  }, []);

  const incrementOctave = useCallback(() => {
    setBaseOctave((prev) => Math.min(MAX_OCTAVE, prev + 1));
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        decrementOctave();
      }
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        incrementOctave();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [decrementOctave, incrementOctave]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (event: MouseEvent) => {
      if (!panelRef.current) return;
      const width = panelRef.current.offsetWidth;
      const height = panelRef.current.offsetHeight;
      const maxX = window.innerWidth - width - 24;
      const maxY = window.innerHeight - height - 24;
      const nextX = clamp(event.clientX - dragOffset.current.x, 24, maxX);
      const nextY = clamp(event.clientY - dragOffset.current.y, 24, maxY);
      setPosition({ x: nextX, y: nextY });
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const handleDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsDragging(true);
  };

  const { noteRange, keyboardShortcuts, labelMap } = useMemo(() => {
    const firstMidi = MidiNumbers.fromNote(`c${baseOctave}`);
    const lastMidi = firstMidi + 24;
    const map: Record<number, string[]> = {};
    const shortcuts: { key: string; midiNumber: number }[] = [];

    const addMapping = (sequence: string, octaveOffset: number) => {
      sequence.split("").forEach((char, index) => {
        const midi = firstMidi + octaveOffset + index;
        if (midi > lastMidi) {
          return;
        }
        if (!char) {
          return;
        }
        shortcuts.push({ key: char, midiNumber: midi });
        const display = /[a-z]/i.test(char) ? char.toUpperCase() : char;
        if (map[midi]) {
          if (!map[midi].includes(display)) {
            map[midi].push(display);
          }
        } else {
          map[midi] = [display];
        }
      });
    };

    addMapping(LOWER_SEQUENCE, 0);
    addMapping(UPPER_SEQUENCE, 12);

    return {
      noteRange: { first: firstMidi, last: lastMidi },
      keyboardShortcuts: shortcuts,
      labelMap: map,
    };
  }, [baseOctave]);

  return (
    <div
      ref={panelRef}
      className="fixed z-40 w-[560px] max-w-[95vw] select-none"
      style={{ left: position.x, top: position.y }}
    >
      <div className="rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 p-1">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
          <div
            className="flex items-center gap-2 cursor-grab"
            onMouseDown={handleDragStart}
          >
            <GripHorizontal className="h-4 w-4" />
            <span>On-Screen Piano</span>
            {!ready && (
              <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">
                Loading samples…
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={decrementOctave}
              disabled={baseOctave <= MIN_OCTAVE}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-gray-300">
              Oct {baseOctave}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={incrementOctave}
              disabled={baseOctave >= MAX_OCTAVE}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-gray-900">
          <KeyboardInput
            disabled={disabled || !ready}
            onNoteOn={onNoteOn}
            onNoteOff={onNoteOff}
            noteRange={noteRange}
            keyboardShortcuts={keyboardShortcuts}
            labelMap={labelMap}
          />
        </div>
      </div>
    </div>
  );
};

export default KeyboardPanel;
