"use client";

import protobuf, { Type } from "protobufjs";
import log from "@/lib/logger";

export interface ProtoCache {
  EditListType: Type | null;
  NoteListType: Type | null;
  initialized: boolean;
  initializing: boolean;
  error: Error | null;
}

export let protobufTypeCache: ProtoCache = {
  EditListType: null,
  NoteListType: null,
  initialized: false,
  initializing: false,
  error: null,
};

export async function initProtobufTypes(): Promise<{
  EditListType: Type | null;
  NoteListType: Type | null;
}> {
  if (
    protobufTypeCache.initialized &&
    protobufTypeCache.EditListType &&
    protobufTypeCache.NoteListType
  ) {
    return {
      EditListType: protobufTypeCache.EditListType,
      NoteListType: protobufTypeCache.NoteListType,
    };
  }

  if (protobufTypeCache.initializing) {
    return { EditListType: null, NoteListType: null };
  }

  log.debug("Initializing protobuf types");
  protobufTypeCache.initializing = true;
  protobufTypeCache.error = null;

  try {
    const timestamp = Date.now();
    const protoUrl = `/static/notes.proto?t=${timestamp}`;
    log.debug(`Loading proto definition from ${protoUrl}`);

    const root = await protobuf.load(protoUrl);
    const EditListType = root.lookupType("EditList");
    const NoteListType = root.lookupType("NoteList");

    protobufTypeCache = {
      EditListType,
      NoteListType,
      initialized: true,
      initializing: false,
      error: null,
    };

    return { EditListType, NoteListType };
  } catch (error: any) {
    log.error("Error initializing protobuf types:", error);
    protobufTypeCache = {
      EditListType: null,
      NoteListType: null,
      initialized: false,
      initializing: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
    return { EditListType: null, NoteListType: null };
  }
}
