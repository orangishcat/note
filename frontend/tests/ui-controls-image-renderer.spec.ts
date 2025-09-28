import { test, expect } from "@playwright/test";
test.skip(({ browserName }) => browserName === "webkit", "Skip WebKit");
import fs from "fs";
import path from "path";
const resources = path.resolve(__dirname, "../../backend/resources");
const readResource = (...segments: string[]) =>
  fs.readFileSync(path.join(resources, ...segments));
test("PDF controls: reset zoom button works and annotations render", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("debug", "true");
  });
  await page.route(
    "**/databases/**/collections/**/documents/**",
    async (route) => {
      const body = {
        $id: "pdf-test-controls",
        name: "PDF Controls Test",
        subtitle: "",
        user_id: "u1",
        file_id: "67e2455bf1eaa75ff360",
        notes_id: "",
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
  await page.goto("/app/score/pdf-test-controls");
  await page.waitForSelector(".pdfViewer", { state: "attached" });
  await page.waitForTimeout(300);
  const pageSelector = ".pdfViewer .page";
  await page.waitForSelector(pageSelector, { state: "visible" });
  const baseWidth = await page.$eval(
    pageSelector,
    (el) => el.getBoundingClientRect().width,
  );
  await expect
    .poll(
      async () =>
        await page.evaluate(() =>
          Boolean((window as any).__pdfViewers?.["67e2455bf1eaa75ff360"]),
        ),
    )
    .toBeTruthy();
  const baseScale = await page.evaluate(
    () =>
      (window as any).__pdfViewers?.["67e2455bf1eaa75ff360"]
        ?.currentScale as number,
  );
  expect(typeof baseScale).toBe("number");
  expect(baseScale).toBeGreaterThan(0);
  await page.evaluate(() => {
    const v = (window as any).__pdfViewers?.["67e2455bf1eaa75ff360"];
    if (v) v.currentScaleValue = "page-width";
  });
  const widthModeWidth = await page.$eval(
    pageSelector,
    (el) => el.getBoundingClientRect().width,
  );
  expect(widthModeWidth).toBeGreaterThan(0);
  const resetBtn = page.getByTestId("btn-zoom-reset");
  await resetBtn.click();
  await expect
    .poll(
      async () =>
        await page.$eval(
          pageSelector,
          (el) => el.getBoundingClientRect().width,
        ),
    )
    .toBeGreaterThan(0);
  const resetWidth = await page.$eval(
    pageSelector,
    (el) => el.getBoundingClientRect().width,
  );
  expect(Math.abs(resetWidth - baseWidth)).toBeLessThan(baseWidth * 0.1);
  await page.evaluate(() => {
    const editList = {
      edits: [
        {
          operation: 0,
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
    `#score-67e2455bf1eaa75ff360 .score-container .note-rectangle`,
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
      { timeout: 10000 },
    )
    .toBeGreaterThan(0);
});
