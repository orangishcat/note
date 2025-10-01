import { useEffect, useRef, useState } from "react";
import type { Input } from "webmidi";
import log from "@/lib/logger";

export interface MidiStatus {
  deviceName: string | null;
  error: string | null;
  ready: boolean;
}

type NoteHandler = (midi: number, velocity: number) => void;
type NoteOffHandler = (midi: number) => void;

const DEFAULT_STATUS: MidiStatus = {
  deviceName: null,
  error: null,
  ready: false,
};

export function useMidiInput(
  enabled: boolean,
  onNoteOn: NoteHandler,
  onNoteOff: NoteOffHandler,
): MidiStatus {
  const [status, setStatus] = useState<MidiStatus>(DEFAULT_STATUS);
  const midiRef = useRef<typeof import("webmidi").WebMidi | null>(null);
  const inputRef = useRef<Input | null>(null);

  useEffect(() => {
    let disposed = false;
    if (!enabled) {
      setStatus(DEFAULT_STATUS);
      return () => {
        disposed = true;
        try {
          inputRef.current?.removeListener();
          inputRef.current = null;
          if (midiRef.current?.enabled) {
            void midiRef.current.disable();
          }
        } catch (error) {
          log.error("Error cleaning up MIDI input", error);
        }
      };
    }
    (async () => {
      try {
        const { WebMidi } = await import("webmidi");
        if (disposed) return;
        midiRef.current = WebMidi;
        await WebMidi.enable();
        if (disposed) return;
        if (WebMidi.inputs.length === 0) {
          setStatus({
            deviceName: null,
            error: "No MIDI inputs detected",
            ready: false,
          });
          return;
        }
        const input = WebMidi.inputs[0];
        inputRef.current = input;
        setStatus({ deviceName: input.name, error: null, ready: true });
        input.addListener("noteon", (event) => {
          if (disposed) return;
          const velocity =
            typeof event.note.attack === "number" ? event.note.attack : 0.8;
          onNoteOn(event.note.number, velocity);
        });
        input.addListener("noteoff", (event) => {
          if (disposed) return;
          onNoteOff(event.note.number);
        });
      } catch (error) {
        log.error("Failed to initialize MIDI input", error);
        if (!disposed) {
          setStatus({
            deviceName: null,
            error: "Unable to access MIDI devices",
            ready: false,
          });
        }
      }
    })();
    return () => {
      disposed = true;
      try {
        inputRef.current?.removeListener();
        inputRef.current = null;
        if (midiRef.current?.enabled) {
          void midiRef.current.disable();
        }
      } catch (error) {
        log.error("Error cleaning up MIDI input", error);
      }
    };
  }, [enabled, onNoteOn, onNoteOff]);

  return status;
}
