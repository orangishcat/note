"use client";

import protobuf, { Type } from "protobufjs";
import log from "@/lib/logger";

export interface ProtoCache {
  ScoringResultType: Type | null;
  NoteListType: Type | null;
  RecordingType: Type | null;
  initialized: boolean;
  initializing: boolean;
  error: Error | null;
  schemaVersion: number;
}

export let protobufTypeCache: ProtoCache = {
  ScoringResultType: null,
  NoteListType: null,
  RecordingType: null,
  initialized: false,
  initializing: false,
  error: null,
  schemaVersion: 0,
};

const REQUIRED_FIELDS: Record<
  keyof Pick<
    ProtoCache,
    "ScoringResultType" | "NoteListType" | "RecordingType"
  >,
  string[]
> = {
  ScoringResultType: ["edits", "size", "unstableRate", "tempoSections"],
  NoteListType: ["notes", "size", "voices", "lines"],
  RecordingType: ["playedNotes", "computedEdits", "createdAt"],
};

let loadPromise: Promise<{
  ScoringResultType: Type | null;
  NoteListType: Type | null;
  RecordingType: Type | null;
}> | null = null;

function resetCache(): void {
  protobufTypeCache = {
    ScoringResultType: null,
    NoteListType: null,
    RecordingType: null,
    initialized: false,
    initializing: false,
    error: null,
    schemaVersion: 0,
  };
  loadPromise = null;
}

function hasRequiredFields(type: Type | null, expected: string[]): boolean {
  if (!type) return false;
  const fields = type.fields ?? {};
  return expected.every((field) =>
    Object.prototype.hasOwnProperty.call(fields, field),
  );
}

function cacheHasExpectedSchema(): boolean {
  return (
    protobufTypeCache.initialized &&
    hasRequiredFields(
      protobufTypeCache.ScoringResultType,
      REQUIRED_FIELDS.ScoringResultType,
    ) &&
    hasRequiredFields(
      protobufTypeCache.NoteListType,
      REQUIRED_FIELDS.NoteListType,
    ) &&
    hasRequiredFields(
      protobufTypeCache.RecordingType,
      REQUIRED_FIELDS.RecordingType,
    )
  );
}

export async function initProtobufTypes(): Promise<{
  ScoringResultType: Type | null;
  NoteListType: Type | null;
  RecordingType: Type | null;
}> {
  if (cacheHasExpectedSchema()) {
    return {
      ScoringResultType: protobufTypeCache.ScoringResultType,
      NoteListType: protobufTypeCache.NoteListType,
      RecordingType: protobufTypeCache.RecordingType,
    };
  }

  if (protobufTypeCache.initialized && !cacheHasExpectedSchema()) {
    log.warn(
      "Detected stale protobuf schema cache; forcing reload from /static/notes.proto",
    );
    resetCache();
  }

  if (loadPromise) {
    return loadPromise;
  }

  log.debug("Initializing protobuf types");
  protobufTypeCache.initializing = true;
  protobufTypeCache.error = null;

  loadPromise = (async () => {
    try {
      const timestamp = Date.now();
      const protoUrl = `/static/notes.proto?t=${timestamp}`;
      log.debug(`Loading proto definition from ${protoUrl}`);

      const root = await protobuf.load(protoUrl);
      const ScoringResultType = root.lookupType("ScoringResult");
      const NoteListType = root.lookupType("NoteList");
      const RecordingType = root.lookupType("Recording");

      protobufTypeCache = {
        ScoringResultType,
        NoteListType,
        RecordingType,
        initialized: true,
        initializing: false,
        error: null,
        schemaVersion: timestamp,
      };

      return { ScoringResultType, NoteListType, RecordingType };
    } catch (error: unknown) {
      log.error("Error initializing protobuf types:", error);
      protobufTypeCache = {
        ScoringResultType: null,
        NoteListType: null,
        RecordingType: null,
        initialized: false,
        initializing: false,
        error: error instanceof Error ? error : new Error(String(error)),
        schemaVersion: 0,
      };
      return {
        ScoringResultType: null,
        NoteListType: null,
        RecordingType: null,
      };
    } finally {
      protobufTypeCache.initializing = false;
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export async function reloadProtobufTypes(): Promise<{
  ScoringResultType: Type | null;
  NoteListType: Type | null;
  RecordingType: Type | null;
}> {
  resetCache();
  return initProtobufTypes();
}
