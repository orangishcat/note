import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const resources = path.resolve(__dirname, "../../backend/resources");
const readResource = (...segments: string[]) =>
  fs.readFileSync(path.join(resources, ...segments));

test("renders edits on image (PDF) score renderer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  // Appwrite document fetch (score doc)
  await page.route(
    "**/databases/**/collections/**/documents/**",
    async (route) => {
      const body = {
        $id: "pdf-test",
        name: "PDF Test",
        subtitle: "",
        user_id: "u1",
        file_id: "67e2455bf1eaa75ff360",
        notes_id: "spiderdance_notes",
        preview_id: "",
        audio_file_id: "",
        mime_type: "application/pdf",
        starred_users: [],
        $collectionId: "scores",
        $databaseId: "main",
        $createdAt: new Date().toISOString(),
        $updatedAt: new Date().toISOString(),
        $permissions: [],
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );

  // Notes protobuf
  await page.route(
    "**/storage/**/files/spiderdance_notes/download**",
    async (route) => {
      const buf = readResource("scores", "spiderdance_notes.pb");
      await route.fulfill({
        status: 200,
        body: buf,
        headers: { "Content-Type": "application/octet-stream" },
      });
    },
  );

  // Score PDF
  await page.route(
    "**/storage/**/files/67e2455bf1eaa75ff360/download**",
    async (route) => {
      const buf = readResource("scores", "67e2455bf1eaa75ff360.pdf");
      await route.fulfill({
        status: 200,
        body: buf,
        headers: { "Content-Type": "application/pdf" },
      });
    },
  );

  // notes.proto
  await page.route("**/static/notes.proto**", async (route) => {
    const txt = readResource("static", "notes.proto");
    await route.fulfill({
      status: 200,
      body: txt,
      headers: { "Content-Type": "text/plain" },
    });
  });

  // Auth/account endpoints (used for JWT in api client)
  await page.route("**/account/jwt", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jwt: "dummy" }),
    });
  });
  await page.route("**/account", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Enable debug mode (test hook)
  await page.addInitScript(() => {
    localStorage.setItem("debug", "true");
  });

  await page.goto("/app/score/pdf-test");

  // Wait for PDF viewer container to attach
  const fileId = "67e2455bf1eaa75ff360";
  await page.waitForSelector(`#score-${fileId} .score-container`, {
    state: "attached",
  });

  // Inject a minimal edit list via testing hook and redraw
  await page.evaluate(() => {
    const editList = {
      edits: [
        {
          operation: "INSERT",
          pos: 0,
          sChar: {
            pitch: 60,
            startTime: 0,
            duration: 1,
            velocity: 80,
            page: 0,
            track: 0,
            bbox: [100, 100, 160, 140],
            confidence: 5,
            id: 1,
          },
          tChar: {
            pitch: 62,
            startTime: 0,
            duration: 1,
            velocity: 80,
            page: 0,
            track: 0,
            bbox: [170, 100, 230, 140],
            confidence: 5,
            id: 2,
          },
          tPos: 0,
        },
      ],
      size: [1030, 1456],
      unstableRate: 0,
      tempoSections: [],
    } as any;
    (window as any).__setEditList?.(editList);
    document.dispatchEvent(
      new CustomEvent("score:redrawAnnotations", { bubbles: true }),
    );
  });

  // Wait until at least one annotation appears
  const notesLocator = page.locator(
    `#score-${fileId} .score-container .note-rectangle`,
  );
  await expect
    .poll(async () => await notesLocator.count(), { timeout: 30000 })
    .toBeGreaterThan(0);
});
