import axios from "axios";
import log from "./logger";
import { account } from "./appwrite";
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});
let openAuthModal: ((type: "login" | "signup") => void) | null = null;
let navigateFunction: ((path: string) => void) | null = null;
export const setAuthModalOpener = (
  opener: (type: "login" | "signup") => void,
) => {
  openAuthModal = opener;
};
export const setNavigateFunction = (navigate: (path: string) => void) => {
  navigateFunction = navigate;
};
let cachedJwt: string | null = null;
let jwtExpiry = 0;
api.interceptors.request.use(async (config) => {
  const payload = config.data;
  if (
    payload &&
    typeof ArrayBuffer !== "undefined" &&
    typeof ArrayBuffer.isView === "function" &&
    ArrayBuffer.isView(payload)
  ) {
    const view = payload as ArrayBufferView;
    const needsSlice =
      view.byteOffset !== 0 || view.byteLength !== view.buffer.byteLength;
    config.data = needsSlice
      ? view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
      : view.buffer;
  }
  if (!config.url?.includes("http")) {
    const now = Date.now();
    if (!cachedJwt || now >= jwtExpiry) {
      try {
        const { jwt } = await account.createJWT();
        cachedJwt = jwt;
        jwtExpiry = now + 15 * 60 * 1000;
      } catch (err) {
        log.error("Failed to create JWT", err);
      }
    }
    if (cachedJwt) {
      config.headers.Authorization = `Bearer ${cachedJwt}`;
    }
  }
  return config;
});
export default api;
