import { test } from "next/dist/experimental/testmode/playwright/msw";
import { expect } from "@playwright/test";
import { http, HttpResponse } from "msw";
import fs from "fs";
import path from "path";

const appwriteEndpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const databaseId = process.env.NEXT_PUBLIC_DATABASE;
const scoresCollection = process.env.NEXT_PUBLIC_SCORES_COLLECTION;
const filesBucket = process.env.NEXT_PUBLIC_FILES_BUCKET;
const scoresBucket = process.env.NEXT_PUBLIC_SCORES_BUCKET;

if (
  !appwriteEndpoint ||
  !databaseId ||
  !scoresCollection ||
  !filesBucket ||
  !scoresBucket
) {
  throw new Error("Missing environment variables");
}

const resources = path.resolve(__dirname, "../../backend/resources");
const scoreId = "67b58d01944eef23f546";

const documentResponse = {
  $id: scoreId,
  name: "Spider Dance",
  subtitle: "Toby Fox (arr. Lattice)",
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
const getHandlers = [
  http.get(/.*\/databases\/.*\/collections\/.*\/documents\/.*/, () =>
    HttpResponse.json(documentResponse),
  ),
  http.get(
    /.*\/storage\/buckets\/.*\/files\/spiderdance_notes\/download.*/,
    () =>
      new HttpResponse(readResource("scores", "spiderdance_notes.pb"), {
        headers: { "Content-Type": "application/octet-stream" },
      }),
  ),
  http.get(
    /.*\/storage\/buckets\/.*\/files\/67e2455bf1eaa75ff360\/download.*/,
    () =>
      new HttpResponse(readResource("scores", "67e2455bf1eaa75ff360.zip"), {
        headers: { "Content-Type": "application/zip" },
      }),
  ),
  http.get(
    /.*\/static\/notes\.proto.*/,
    () =>
      new HttpResponse(readResource("static", "notes.proto"), {
        headers: { "Content-Type": "text/plain" },
      }),
  ),
];

console.log(
  "Handlers: ",
  getHandlers.map((h) => h.info.path),
);

test.beforeEach(async ({ page }) => {
  // Log any requests that fail to even send
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    console.error(
      `❌ REQUEST FAILED: ${request.method()} ${request.url()}` +
        (failure ? ` – ${failure.errorText}` : ""),
    );
  });

  // Log any responses with non-2xx status codes
  page.on("response", (response) => {
    if (!response.ok()) {
      console.error(
        `⚠️ BAD RESPONSE: ${response.status()} ${response.url()}` +
          ` – content-type: ${response.headers()["content-type"]}`,
      );
    }
  });
});

// --- 1) Page-load spec, with infinite-loop guard ---
test("score page loads successfully without infinite custom-event loops", async ({
  page,
  msw,
}) => {
  msw.use(...getHandlers);

  // Count how many times our custom-event log appears
  let customEventCount = 0;
  page.on("console", (msg) => {
    const text = msg.text();
    if (/redraw annotations/.test(text)) {
      customEventCount++;
    }
  });

  await page.goto(`http://localhost:3000/score/${scoreId}`);
  await page.getByRole("img").first().waitFor();
  await expect(page.getByText(documentResponse.name)).toBeVisible();
  await expect(page.getByText(documentResponse.subtitle)).toBeVisible();

  expect(
    customEventCount,
    `saw ${customEventCount} redraw annotations logs`,
  ).toBeLessThan(8);
});

// --- 2) Notes-API spec (unchanged) ---
test("notes API returns protobuf with combined format header", async ({
  page,
  msw,
}) => {
  msw.use(
    ...getHandlers,
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
