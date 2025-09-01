import { test, expect } from "@playwright/test";
test.skip(({ browserName }) => browserName === "webkit", "Skip WebKit");
import fs from "fs";
import path from "path";

const resources = path.resolve(__dirname, "../../backend/resources");
const readResource = (...segments: string[]) =>
  fs.readFileSync(path.join(resources, ...segments));

const MIN_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

test("renders edits on musicxml renderer", async ({ page }) => {
  // Mock score document
  await page.route(
    "**/databases/**/collections/**/documents/**",
    async (route) => {
      const body = {
        $id: "mxml-test",
        name: "MXML Test",
        subtitle: "",
        user_id: "u1",
        file_id: "mxml-file",
        notes_id: "spiderdance_notes",
        preview_id: "",
        audio_file_id: "",
        mime_type: "application/vnd.recordare.musicxml+xml",
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

  // MusicXML content via view, with download fallback
  await page.route("**/storage/**/files/mxml-file/view**", async (route) => {
    await route.fulfill({
      status: 200,
      body: MIN_MUSICXML,
      headers: { "Content-Type": "application/xml" },
    });
  });
  await page.route(
    "**/storage/**/files/mxml-file/download**",
    async (route) => {
      await route.fulfill({
        status: 200,
        body: MIN_MUSICXML,
        headers: { "Content-Type": "application/xml" },
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

  await page.addInitScript(() => localStorage.setItem("debug", "true"));
  await page.goto("/app/score/mxml-test");

  // Wait for OSMD SVG output and overlay container
  await page.waitForSelector(`#score-mxml-file .score-container`, {
    state: "attached",
  });

  // Ensure debug panel is present
  await expect(page.getByText("Debug Panel")).toBeVisible();

  // Wait for OSMD instance to be registered and then inject edit list
  await expect
    .poll(
      async () =>
        await page.evaluate(() =>
          Boolean((window as any).__osmdInstances?.["mxml-file"]),
        ),
    )
    .toBeTruthy();

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

  const notesLocator = page.locator(
    `#score-mxml-file .score-container .note-rectangle`,
  );
  await expect
    .poll(
      async () => {
        await page.evaluate(() =>
          document.dispatchEvent(
            new CustomEvent("score:redrawAnnotations", { bubbles: true }),
          ),
        );
        return await notesLocator.count();
      },
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
});
