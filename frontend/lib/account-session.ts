import { account } from "@/lib/appwrite";
import type { AccountView } from "@/types/provider-types";
import log from "loglevel";

function normalizeAccount(user: {
  $id: string;
  name?: string | null;
  email?: string | null;
}): AccountView {
  const fallbackName =
    user.name && user.name.trim().length > 0
      ? user.name
      : `Guest ${user.$id.slice(-6)}`;
  return {
    user_id: user.$id,
    username: fallbackName,
    email: user.email ?? "",
  };
}

export async function ensureAccountSession(): Promise<AccountView | null> {
  try {
    const existing = await account.get();
    return normalizeAccount(existing);
  } catch (err) {
    log.debug("No active Appwrite session; creating anonymous session", err);
    try {
      await account.createAnonymousSession();
      const user = await account.get();
      return normalizeAccount(user);
    } catch (createErr) {
      log.error("Failed to establish anonymous Appwrite session", createErr);
      return null;
    }
  }
}
