import { test } from "next/dist/experimental/testmode/playwright/msw";
import { expect, type Page, type Route } from "@playwright/test";
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
const logHandlers = false;

const accountResponse = {
  $id: "67b267e2002cb21103ff",
  $createdAt: "2025-02-28T22:33:57.460+00:00",
  $updatedAt: "2025-07-03T22:25:43.711+00:00",
  name: "orangishcat",
  registration: "2025-02-16T22:33:57.458+00:00",
  status: true,
  labels: [],
  email: "testemail@gmail.com",
  phone: "",
  emailVerification: false,
  phoneVerification: false,
  mfa: false,
  prefs: {},
  targets: [],
  accessedAt: "2025-07-07 23:15:03.548",
};

const doc = {
  $id: "67b58d01944eef23f546",
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
function getHandlers() {
  return [
    http.get(/.*\/databases\/.*\/collections\/.*\/documents$/, () =>
      HttpResponse.json({ documents: [] }),
    ),
    http.get(/.*\/databases\/.*\/collections\/.*\/documents\/.*$/, () =>
      HttpResponse.json(doc),
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
    http.get(/.*\/account$/, () => HttpResponse.json(accountResponse)),
    http.post(/.*\/account\/jwt$/, () => HttpResponse.json({ jwt: "dummy" })),
  ];
}

if (logHandlers) {
  console.log(
    "Handlers: ",
    getHandlers().map((h) => h.info.path),
  );
}

function registerLogging(page: Page) {
  // Log any requests that fail to even send
  page.on("requestfailed", (request: any) => {
    const failure = request.failure();
    console.error(
      `❌ REQUEST FAILED: ${request.method()} ${request.url()}` +
        (failure ? ` – ${failure.errorText}` : ""),
    );
  });

  // Log any responses with non-2xx status codes
  page.on("response", (response: any) => {
    if (!response.ok()) {
      console.error(
        `⚠️ BAD RESPONSE: ${response.status()} ${response.url()}` +
          ` – content-type: ${response.headers()["content-type"]}`,
      );
    }
  });

  // Log page errors
  page.on("pageerror", (err: any) => {
    console.error("PAGE ERROR:", err);
  });

  // Log all console messages
  page.on("console", (msg: any) => {
    if (msg.type !== "warning") return;
    console.log(`BROWSER ${msg.type()}:`, msg.text());
  });
}

async function registerRoutes(page: Page) {
  await page.route("https://cloud.appwrite.io/v1/account", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(accountResponse),
    }),
  );
  await page.route(
    "https://cloud.appwrite.io/v1/account/jwts",
    (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jwt: "dummy" }),
      }),
  );
  await page.route("**/api/audio/receive", (route: Route) => {
    console.log("Intercepted audio request", route.request().url());
    route.fulfill({
      status: 200,
      body: readResource("scores", "spider_dance_edits.pb"),
      headers: {
        "Content-Type": "application/protobuf",
        "X-Response-Format": "combined",
      },
    });
  });
  await page.route("**/static/notes.proto*", (route: Route) =>
    route.fulfill({
      status: 200,
      body: readResource("static", "notes.proto"),
      headers: { "Content-Type": "text/plain" },
    }),
  );
  await page.route(
    /https:\/\/cloud\.appwrite\.io\/v1\/storage\/buckets\/.*\/files\/.*\/download.*/,
    (route: Route) => {
      const url = route.request().url();
      if (url.includes("spiderdance_notes")) {
        route.fulfill({
          status: 200,
          body: readResource("scores", "spiderdance_notes.pb"),
          headers: { "Content-Type": "application/octet-stream" },
        });
      } else if (url.includes("67e2455bf1eaa75ff360")) {
        route.fulfill({
          status: 200,
          body: readResource("scores", "67e2455bf1eaa75ff360.zip"),
          headers: { "Content-Type": "application/zip" },
        });
      } else {
        route.fulfill({ status: 200, body: "" });
      }
    },
  );
}

test.beforeEach(async ({ page }) => {
  registerLogging(page);
  await registerRoutes(page);
});

// --- 1) Page-load spec, with infinite-loop guard ---
test("score page loads successfully without infinite redraw annotation loops", async ({
  page,
  msw,
}) => {
  msw.use(...getHandlers());

  // Count how many times our redraw annotation log appears
  let customEventCount = 0;
  page.on("console", (msg) => {
    const text = msg.text();
    if (/redraw annotations/.test(text)) {
      customEventCount++;
    }
  });

  await page.goto(`http://localhost:3000/score/${doc.$id}`);
  const img = page.getByRole("img", { name: "Score page 1" });
  await img.waitFor();
  const loaded = await img.evaluate(
    (el) =>
      (el as HTMLImageElement).complete &&
      (el as HTMLImageElement).naturalWidth > 0,
  );
  expect(loaded).toBe(true);

  await page.locator(`#score-${doc.file_id} .score-container`).waitFor();
  await expect(page.getByText(doc.name)).toBeVisible();
  await expect(page.getByText(doc.subtitle)).toBeVisible();

  expect(
    customEventCount,
    `saw ${customEventCount} redraw annotations logs`,
  ).toBeLessThan(8);
});

// --- 2) notes.proto loads automatically ---
test("notes.proto is fetched on page load", async ({ page, msw }) => {
  msw.use(...getHandlers());

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/static/notes.proto") && res.ok(),
    ),
    page.goto(`http://localhost:3000/score/${doc.$id}`),
  ]);

  expect(response.ok()).toBe(true);
});

// --- 3) Notes-API spec ---
test("notes API returns protobuf with combined format header", async ({
  page,
  msw,
}) => {
  msw.use(
    ...getHandlers(),
    http.post(
      /\/api\/audio\/receive$/,
      () =>
        new HttpResponse(readResource("scores", "spider_dance_edits.pb"), {
          status: 200,
          headers: {
            "Content-Type": "application/protobuf",
            "X-Response-Format": "combined",
          },
        }),
    ),
  );

  await page.goto(`http://localhost:3000/score/${doc.$id}`);

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

// --- 4) Debug panel interaction ---
test("debug panel filters edits by confidence", async ({ page, msw }) => {
  msw.use(
    ...getHandlers(),
    http.post(
      /\/api\/audio\/receive$/,
      () =>
        new HttpResponse(readResource("scores", "spider_dance_edits.pb"), {
          status: 200,
          headers: {
            "Content-Type": "application/protobuf",
            "X-Response-Format": "combined",
          },
        }),
    ),
  );

  await page.addInitScript(() => {
    localStorage.setItem("debug", "true");
  });

  await page.goto(`http://localhost:3000/score/${doc.$id}`);

  const img = page.getByRole("img").first();
  await img.waitFor();

  await expect(page.getByText("Debug Panel")).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/audio/receive") && res.ok(),
    ),
    page.getByRole("button", { name: "Send Test Request" }).click(),
  ]);

  const editsText = page.getByText(/Edits:/);
  const getTotal = async () => {
    const txt = await editsText.innerText();
    const match = txt.match(/\d+\/\d+/);
    return match ? parseInt(match[0].split("/")[1], 10) : 0;
  };

  await expect.poll(getTotal, { timeout: 15000 }).toBeGreaterThan(120);

  const slider = page.locator('input[type="range"]').nth(1);
  await slider.evaluate((el) => {
    (el as HTMLInputElement).value = "5";
    el.dispatchEvent(new Event("mouseup", { bubbles: true }));
  });

  const editsAfterChange = await getTotal();
  expect(editsAfterChange).toBeGreaterThan(60);
  expect(editsAfterChange).toBeLessThan(100);

  await slider.evaluate((el) => {
    (el as HTMLInputElement).value = "3";
    el.dispatchEvent(new Event("mouseup", { bubbles: true }));
  });

  const editsBack = await getTotal();
  expect(editsBack).toBeGreaterThan(120);
});

// --- 5) annotations redraw per page change ---
test("annotations update when page changes", async ({ page, msw }) => {
  msw.use(
    ...getHandlers(),
    http.post(
      /\/api\/audio\/receive$/,
      () =>
        new HttpResponse(readResource("scores", "spider_dance_edits.pb"), {
          status: 200,
          headers: {
            "Content-Type": "application/protobuf",
            "X-Response-Format": "combined",
          },
        }),
    ),
  );

  await page.addInitScript(() => {
    localStorage.setItem("debug", "true");
  });

  await page.goto(`http://localhost:3000/score/${doc.$id}`);

  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/audio/receive") && res.ok(),
    ),
    page.getByRole("button", { name: "Send Test Request" }).click(),
  ]);

  const countNotes = async () =>
    page.locator(`#score-${doc.file_id} .note-rectangle`).count();

  const first = await countNotes();
  expect(first).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Next page" }).click();

  await expect.poll(countNotes).not.toBe(first);
});
