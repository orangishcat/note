import { account } from "@/lib/appwrite";

export async function logOut() {
  try {
    await account.deleteSession("current");
  } catch (e) {
    console.error("Failed to log out:", e);
  }
}
