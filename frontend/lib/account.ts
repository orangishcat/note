import { account } from "@/lib/appwrite";
import log from "loglevel";

export async function logOut() {
  try {
    await account.deleteSession("current");
  } catch (e) {
    log.error("Failed to log out:", e);
  }
}
