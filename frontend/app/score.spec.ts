import { test } from "next/dist/experimental/testmode/playwright/msw";
import { expect } from "@playwright/test";
import { http, HttpResponse } from "msw";
import fs from "fs";
import path from "path";

const appwriteEndpoint =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? "https://cloud.appwrite.io/v1";
const databaseId = process.env.NEXT_PUBLIC_DATABASE ?? "";
const scoresCollection = process.env.NEXT_PUBLIC_SCORES_COLLECTION ?? "";
const filesBucket = process.env.NEXT_PUBLIC_FILES_BUCKET ?? "";
const scoresBucket = process.env.NEXT_PUBLIC_SCORES_BUCKET ?? "";

const resources = path.resolve(__dirname, "../../backend/resources");

const scoreId = "67b58d01944eef23f546";

const documentResponse = {
  $id: scoreId,
  name: "Spider Dance",
  subtitle: "",
  user_id: "test-user",
  file_id: "67e2455bf1eaa75ff360",
  notes_id: "spiderdance_notes",
  preview_id: "preview",
  audio_file_id: "",
  mime_type: "application/pdf",
  starred_users: [],
  $collectionId: scoresCollection,
  $databaseId: databaseId,
  $createdAt: "",
  $updatedAt: "",
  $permissions: [],
};

function readResource(...segments: string[]) {
  return fs.readFileSync(path.join(resources, ...segments));
}

test("score page loads and notes API returns protobuf", async ({
  page,
  msw,
}: {
  page: any;
  msw: any;
}) => {
  msw.use(
    http.get(
      `${appwriteEndpoint}/databases/${databaseId}/collections/${scoresCollection}/documents/${scoreId}`,
      () => HttpResponse.json(documentResponse),
    ),
    http.get(
      `${appwriteEndpoint}/storage/buckets/${filesBucket}/files/spiderdance_notes/download`,
      () =>
        new HttpResponse(readResource("scores", "spiderdance_notes.pb"), {
          headers: { "Content-Type": "application/octet-stream" },
        }),
    ),
    http.get(
      `${appwriteEndpoint}/storage/buckets/${scoresBucket}/files/67e2455bf1eaa75ff360/download`,
      () =>
        new HttpResponse(readResource("scores", "67e2455bf1eaa75ff360.zip"), {
          headers: { "Content-Type": "application/zip" },
        }),
    ),
    http.get(
      /\/static\/notes\.proto.*/,
      () =>
        new HttpResponse(readResource("static", "notes.proto"), {
          headers: { "Content-Type": "text/plain" },
        }),
    ),
    http.post(
      /\/api\/audio\/receive$/,
      () =>
        new HttpResponse(readResource("scores", "last_pb.pb"), {
          status: 200,
          headers: {
            "Content-Type": "application/protobuf",
            "X-Response-Format": "combined",
          },
        }),
    ),
  );

  await page.goto(`http://localhost:3000/score/${scoreId}`);

  // Wait for score images to be loaded
  await page.getByRole("img").first().waitFor();

  // Trigger test request to notes API
  const res = await page.evaluate(async () => {
    const r = await fetch("/api/audio/receive", {
      method: "POST",
      body: new Blob([]),
    });
    return {
      ok: r.ok,
      status: r.status,
      fmt: r.headers.get("X-Response-Format"),
    };
  });

  expect(res.ok).toBe(true);
  expect(res.status).toBe(200);
  expect(res.fmt).toBe("combined");
});
