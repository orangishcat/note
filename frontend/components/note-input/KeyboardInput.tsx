"use client";

import React, { useCallback } from "react";
import { Piano } from "react-piano";
import "react-piano/dist/styles.css";

interface KeyboardInputProps {
  disabled?: boolean;
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
  noteRange: { first: number; last: number };
  keyboardShortcuts: { key: string; midiNumber: number }[];
  labelMap: Record<number, string[]>;
}

const KeyboardInput: React.FC<KeyboardInputProps> = ({
  disabled,
  onNoteOn,
  onNoteOff,
  noteRange,
  keyboardShortcuts,
  labelMap,
}) => {
  const renderLabel = useCallback(
    ({
      midiNumber,
      isAccidental,
      keyboardShortcut,
    }: {
      midiNumber: number;
      isAccidental: boolean;
      keyboardShortcut?: { key: string };
    }) => {
      const labels =
        labelMap[midiNumber] ??
        (keyboardShortcut ? [keyboardShortcut.key.toUpperCase()] : []);
      if (!labels || labels.length === 0) return null;
      return (
        <div
          className={`pointer-events-none select-none text-[10px] leading-[10px] font-semibold tracking-wide mt-1 text-center ${
            isAccidental ? "text-white" : "text-slate-700"
          }`}
        >
          {labels.map((label) => (
            <span key={`${midiNumber}-${label}`} className="block">
              {label}
            </span>
          ))}
        </div>
      );
    },
    [labelMap],
  );
  return (
    <div className="w-full flex justify-center h-24">
      <Piano
        noteRange={noteRange}
        playNote={(midi: number) => onNoteOn(midi)}
        stopNote={(midi: number) => onNoteOff(midi)}
        disabled={disabled}
        keyboardShortcuts={keyboardShortcuts}
        renderNoteLabel={renderLabel}
      />
    </div>
  );
};

export default KeyboardInput;
