import { account } from "@/lib/appwrite";

export async function logOut() {
  await account.deleteSession("current");
}
