import api from "@/lib/network";

export async function logOut() {
  return api.post("/account/logout", {})
}