import axios from "axios";
import log from "./logger";
import { account } from "./appwrite";
import { useQuery } from "@tanstack/react-query";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// This will be set by the layout component
let openAuthModal: ((type: "login" | "signup") => void) | null = null;
let navigateFunction: ((path: string) => void) | null = null;

// Function to set the openAuthModal function from the layout component
export const setAuthModalOpener = (
  opener: (type: "login" | "signup") => void,
) => {
  openAuthModal = opener;
};

// Function to set the navigate function
export const setNavigateFunction = (navigate: (path: string) => void) => {
  navigateFunction = navigate;
};

// Cache JWT for 15 minutes
let cachedJwt: string | null = null;
let jwtExpiry = 0;

// Attach JWT for authenticated requests
api.interceptors.request.use(async (config) => {
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

// Add response interceptor to handle 401 Unauthorized responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Get the current path
      const currentPath =
        typeof window !== "undefined" ? window.location.pathname : "";

      log.debug(
        `Received 401 error. Current path: ${currentPath}, navigateFunction available: ${!!navigateFunction}`,
      );

      // If we're not already at the file manager (root path)
      if (currentPath !== "/" && navigateFunction) {
        // Navigate to the file manager with login parameter
        log.debug(
          "Attempting to navigate to file manager with login parameter",
        );
        navigateFunction("/?login=true");
      } else {
        // If already at the file manager or navigation function not available, just open the modal
        log.debug(
          `Opening auth modal instead. openAuthModal available: ${!!openAuthModal}`,
        );
        if (openAuthModal) {
          openAuthModal("login");
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
