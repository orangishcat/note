"use client";

import protobuf, { Type } from "protobufjs";
import log from "@/lib/logger";

export interface ProtoCache {
  ScoringResultType: Type | null;
  NoteListType: Type | null;
  initialized: boolean;
  initializing: boolean;
  error: Error | null;
}

export let protobufTypeCache: ProtoCache = {
  ScoringResultType: null,
  NoteListType: null,
  initialized: false,
  initializing: false,
  error: null,
};

export async function initProtobufTypes(): Promise<{
  ScoringResultType: Type | null;
  NoteListType: Type | null;
}> {
  if (
    protobufTypeCache.initialized &&
    protobufTypeCache.ScoringResultType &&
    protobufTypeCache.NoteListType
  ) {
    return {
      ScoringResultType: protobufTypeCache.ScoringResultType,
      NoteListType: protobufTypeCache.NoteListType,
    };
  }

  if (protobufTypeCache.initializing) {
    return { ScoringResultType: null, NoteListType: null };
  }

  log.debug("Initializing protobuf types");
  protobufTypeCache.initializing = true;
  protobufTypeCache.error = null;

  try {
    const timestamp = Date.now();
    const protoUrl = `/static/notes.proto?t=${timestamp}`;
    log.debug(`Loading proto definition from ${protoUrl}`);

    const root = await protobuf.load(protoUrl);
    const ScoringResultType = root.lookupType("ScoringResult");
    const NoteListType = root.lookupType("NoteList");

    protobufTypeCache = {
      ScoringResultType,
      NoteListType,
      initialized: true,
      initializing: false,
      error: null,
    };

    return { ScoringResultType, NoteListType };
  } catch (error: any) {
    log.error("Error initializing protobuf types:", error);
    protobufTypeCache = {
      ScoringResultType: null,
      NoteListType: null,
      initialized: false,
      initializing: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
    return { ScoringResultType: null, NoteListType: null };
  }
}
