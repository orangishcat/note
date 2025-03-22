import axios from "axios";

export async function logOut() {
  return axios.post("api/account/logout", {})
}