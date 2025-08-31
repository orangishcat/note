import { Client, Account, Databases, Storage } from "appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;

// Avoid crashing during SSR/prerender if env vars are undefined.
// Configure only when values are present; otherwise, fail fast in browser when used.
const client = new Client();
if (endpoint) client.setEndpoint(endpoint);
if (project) client.setProject(project);

function assertConfigured() {
  if (!endpoint || !project) {
    // Only throw on the client where the SDK will actually be used.
    if (typeof window !== "undefined") {
      throw new Error(
        "Missing Appwrite env vars: NEXT_PUBLIC_APPWRITE_ENDPOINT and NEXT_PUBLIC_APPWRITE_PROJECT must be set.",
      );
    }
  }
}

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// Touching any of these in the browser without config should surface a clear error early.
if (typeof window !== "undefined") {
  assertConfigured();
}
