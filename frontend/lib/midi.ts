import { useEffect, useRef, useState } from "react";
import type { Input, InputChannel, NoteMessageEvent } from "webmidi";
import log from "@/lib/logger";

export interface MidiStatus {
  deviceName: string | null;
  error: string | null;
  ready: boolean;
}

type NoteHandler = (midi: number, velocity: number) => void;
type NoteOffHandler = (midi: number) => void;

type ChannelListener = {
  channel: InputChannel;
  type: "noteon" | "noteoff";
  listener: (event: NoteMessageEvent) => void;
};

const DEFAULT_STATUS: MidiStatus = {
  deviceName: null,
  error: null,
  ready: false,
};
export const MAX_NOTE_VELOCITY = 0.9;

export const clampVelocity = (value: number | undefined): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return MAX_NOTE_VELOCITY;
  }
  return Math.min(Math.max(value, 0), MAX_NOTE_VELOCITY);
};

export function useMidiInput(
  enabled: boolean,
  onNoteOn: NoteHandler,
  onNoteOff: NoteOffHandler,
): MidiStatus {
  const [status, setStatus] = useState<MidiStatus>(DEFAULT_STATUS);
  const midiRef = useRef<typeof import("webmidi").WebMidi | null>(null);
  const inputRef = useRef<Input | null>(null);
  const channelListenersRef = useRef<ChannelListener[]>([]);

  const detachAllListeners = () => {
    channelListenersRef.current.forEach(({ channel, type, listener }) => {
      try {
        channel.removeListener(type, listener);
      } catch (error) {
        const deviceName = channel.input?.name ?? "unknown";
        const channelNumber = channel.number ?? -1;
        log.warn("Failed to remove MIDI channel listener", {
          device: deviceName,
          channel: channelNumber,
          type,
          error,
        });
      }
    });
    channelListenersRef.current = [];
  };

  useEffect(() => {
    let disposed = false;
    if (!enabled) {
      setStatus(DEFAULT_STATUS);
      detachAllListeners();
      return () => {
        disposed = true;
        try {
          detachAllListeners();
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
        if (!input) {
          log.warn("MIDI input list was empty after enable");
          setStatus({
            deviceName: null,
            error: "No MIDI inputs detected",
            ready: false,
          });
          return;
        }
        inputRef.current = input;
        setStatus({ deviceName: input.name, error: null, ready: true });
        log.debug("Attaching MIDI channel listeners", { device: input.name });
        detachAllListeners();
        for (let ch = 1; ch <= 16; ch += 1) {
          const channel = input.channels[ch];
          if (!channel) continue;
          const noteOnListener = (event: NoteMessageEvent) => {
            if (disposed) return;
            const velocity = clampVelocity(event.note.attack);
            onNoteOn(event.note.number, velocity);
          };
          const noteOffListener = (event: NoteMessageEvent) => {
            if (disposed) return;
            onNoteOff(event.note.number);
          };
          channel.addListener("noteon", noteOnListener);
          channelListenersRef.current.push({
            channel,
            type: "noteon",
            listener: noteOnListener,
          });
          channel.addListener("noteoff", noteOffListener);
          channelListenersRef.current.push({
            channel,
            type: "noteoff",
            listener: noteOffListener,
          });
        }
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
        detachAllListeners();
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
