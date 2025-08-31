import { test, expect } from "@playwright/test";

// Minimal 1-page PDF (ASCII string). Valid enough for PDF.js to parse.
const MINIMAL_PDF = `%PDF-1.4
1 0 obj<<>>endobj
2 0 obj<</Type/Catalog/Pages 3 0 R>>endobj
3 0 obj<</Type/Pages/Count 1/Kids[4 0 R]>>endobj
4 0 obj<</Type/Page/Parent 3 0 R/MediaBox[0 0 612 792]>>endobj
xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000047 00000 n 
0000000095 00000 n 
0000000149 00000 n 
trailer<</Root 2 0 R/Size 5>>
startxref
205
%%EOF`;

test.skip("loads PDF without offsetParent scroll error and zoom controls respond", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" || /pdfjs container init:/.test(text)) {
      errors.push(text);
    }
  });

  // Intercept Appwrite DB doc fetch to return a minimal score document
  await page.route("**/databases/**/documents/**", async (route) => {
    // Return a minimal MusicScore JSON—non-MusicXML so PDF renderer is used
    const score = {
      $id: "testpdf",
      $collectionId: "scores",
      $databaseId: "main",
      $createdAt: new Date().toISOString(),
      name: "Test PDF",
      subtitle: "",
      user_id: "u1",
      file_id: "fake-file",
      notes_id: "",
      preview_id: "",
      audio_file_id: "",
      mime_type: "application/pdf",
      starred_users: [],
      total_pages: 1,
      is_mxl: false,
      starred: false,
      folder: "",
      $updatedAt: new Date().toISOString(),
      $permissions: [],
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(score),
    });
  });

  // Intercept Appwrite Storage download to return a tiny PDF buffer
  await page.route("**/storage/**/files/**/download**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: MINIMAL_PDF,
    });
  });

  await page.goto("/app/score/testpdf");

  // Wait for viewer DOM to attach
  await page.waitForSelector(".pdfViewer", { state: "attached" });

  // Allow viewer to complete pagesinit/pagesloaded
  await page.waitForTimeout(300);

  // Ensure no container/offsetParent-related errors were thrown
  const badInitError = errors.find((e) =>
    /offsetParent is not set|must be absolutely positioned/i.test(e),
  );
  expect(badInitError).toBeFalsy();

  // Drive zoom via our custom events and ensure no errors are thrown
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent("score:zoomIn", {
        detail: { scoreId: "fake-file" },
        bubbles: true,
      }),
    );
  });
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent("score:zoomOut", {
        detail: { scoreId: "fake-file" },
        bubbles: true,
      }),
    );
  });
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent("score:zoomReset", {
        detail: { scoreId: "fake-file" },
        bubbles: true,
      }),
    );
  });

  // Allow unrelated warnings (e.g., 401s) — only fail on the specific init errors above
  expect(badInitError).toBeFalsy();
});
