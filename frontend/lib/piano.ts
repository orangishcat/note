import { useCallback, useEffect, useRef, useState } from "react";
import { clampVelocity, MAX_NOTE_VELOCITY } from "@/lib/midi";
import log from "@/lib/logger";

type PianoModule = typeof import("@tonejs/piano");
type PianoInstance = InstanceType<PianoModule["Piano"]>;

export interface PianoController {
  triggerAttack: (midi: number, velocity?: number) => Promise<void> | void;
  triggerRelease: (midi: number) => void;
  ready: boolean;
}

export function usePiano(enabled: boolean): PianoController {
  const moduleRef = useRef<PianoModule | null>(null);
  const pianoRef = useRef<PianoInstance | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    if (!enabled) {
      pianoRef.current?.dispose();
      pianoRef.current = null;
      moduleRef.current = null;
      setReady(false);
      return () => {
        disposed = true;
      };
    }
    if (typeof window === "undefined") {
      return () => {
        disposed = true;
      };
    }
    (async () => {
      try {
        const mod = await import("@tonejs/piano");
        if (disposed) return;
        moduleRef.current = mod;
        const piano = new mod.Piano({
          velocities: 5,
          release: true,
          pedal: false,
          maxPolyphony: 20,
        });
        pianoRef.current = piano;
        piano.toDestination();
        piano.strings.value = -2;
        await piano.load();
        if (disposed) {
          piano.dispose();
          return;
        }
        setReady(true);
      } catch (error) {
        log.error("Failed to initialize piano", error);
      }
    })();
    return () => {
      disposed = true;
      pianoRef.current?.dispose();
      pianoRef.current = null;
      moduleRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  const ensureContext = useCallback(async () => {
    const piano = pianoRef.current;
    if (!piano) return;
    const context = piano.context.rawContext;
    if (context.state !== "running") {
      await context.resume();
    }
  }, []);

  const triggerAttack = useCallback(
    async (midi: number, velocity = MAX_NOTE_VELOCITY) => {
      if (!enabled) return;
      const piano = pianoRef.current;
      if (!piano) return;
      await ensureContext();
      const safeVelocity = clampVelocity(velocity);
      piano.keyDown({ midi, velocity: safeVelocity });
    },
    [enabled, ensureContext],
  );

  const triggerRelease = useCallback(
    (midi: number) => {
      if (!enabled) return;
      const piano = pianoRef.current;
      if (!piano) return;
      piano.keyUp({ midi });
    },
    [enabled],
  );

  return {
    triggerAttack,
    triggerRelease,
    ready,
  };
}
