import { Client, Account, Databases, Storage } from "appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;

const client = new Client();
if (endpoint) client.setEndpoint(endpoint);
if (project) client.setProject(project);

function assertConfigured() {
  if (!endpoint || !project) {
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

if (typeof window !== "undefined") {
  assertConfigured();
}
