import { test } from "next/dist/experimental/testmode/playwright/msw";
import { expect } from "@playwright/test";
import { http, HttpResponse } from "msw";
import fs from "fs";
import path from "path";

const appwriteEndpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const databaseId = process.env.NEXT_PUBLIC_DATABASE;
const scoresCollection = process.env.NEXT_PUBLIC_SCORES_COLLECTION;
const scoresBucket = process.env.NEXT_PUBLIC_SCORES_BUCKET;

if (!appwriteEndpoint || !databaseId || !scoresCollection || !scoresBucket) {
  throw new Error("Missing environment variables");
}

const resources = path.resolve(__dirname, "../../backend/resources");

const sampleMusicXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

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
  $id: "musicxml-test",
  name: "MusicXML Test",
  subtitle: "",
  user_id: "test-user",
  file_id: "musicxml-file",
  notes_id: "spiderdance_notes",
  preview_id: "preview",
  audio_file_id: "",
  mime_type: "application/vnd.recordare.musicxml+xml",
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
      new RegExp(`.*/storage/buckets/.*/files/${doc.file_id}/view.*`),
      () =>
        new HttpResponse(sampleMusicXML, {
          headers: { "Content-Type": "application/xml" },
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

test("music xml renderer loads", async ({ page, msw }) => {
  msw.use(...getHandlers());
  await page.goto(`http://localhost:3000/app/score/${doc.$id}`);
  await expect(page.locator("#osmdSvgPage1")).toBeVisible();
});
