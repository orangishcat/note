# AGENTS.md

Strict engineering guidelines for automated and human contributors.

## Baseline Requirements (Non‑Negotiable)

- Adhere to `.editorconfig` for all files (encoding, EOL, indentation).
- Use pnpm instead of npm as the package manager.
- If you modify any frontend code, run `cd frontend && pnpm run lint` and fix
  all
  warnings and errors before submitting.
  Lint violations are treated as failures.
- The entire Next.js app resides in `frontend`. Always `cd frontend` before
  running `next`, `pnpm`, or `playwright`
  commands.
- Prefer event-driven flows over waits: do not block on visibility checks
  (e.g., `waitForSelector({ state: 'visible' })`) when an event listener can
  signal readiness. Avoid arbitrary delays; use DOM/events and state
  subscriptions instead.
- Use `notes_pb2.py` for protobuf types on the Python backend. Do not hand-edit
  generated types.
- When touching Python, prefer `numpy` for vectorized operations if it is
  clearly faster and equally readable; otherwise
  keep it simple. After any Python change, start the Flask app (`app_main.py`)
  locally to verify no
  syntax/circular‑import errors.
- Appwrite collections must match these attributes exactly:
  - Folder: `name:String`, `files:String[]`
  - Score: `user_id:String`, `file_id:String`, `name:String`, `subtitle:String`,
    `starred_users:String[]`,
    `preview_id:String`, `audio_file_id:String`, `notes_id:String`,
    `mime_type:String`
  - Recordings: `user_id:String`, `file_id:String`

## Project Structure & Tooling

- Frontend root: `frontend/` (Next.js App Router, TypeScript).
- Tests: Playwright specs live in `frontend/tests`. Do not add new specs
  elsewhere.
- Node: Use the version supported by Next 15 (Node 18+). Use the local binary
  when scripting:
  `./node_modules/.bin/next`.
- Package scripts to know:
  - `pnpm run dev` — local dev server (HTTPS experimental is enabled).
  - `pnpm run lint` — ESLint + TypeScript type checks (via `eslint-plugin-tsc`).
    All issues must be fixed.
  - `pnpm test` — Playwright tests leveraging Next’s experimental test mode.

## TypeScript/React (Frontend)

- Language: TypeScript is required for app code. Keep types precise. Avoid `any`
  unless necessary; if unavoidable,
  encapsulate and narrow at module boundaries.
- Imports: Use the path alias `@/*` instead of relative climbing imports. Group
  standard → third‑party → internal
  imports.
- Components:
  - Mark client components explicitly with `"use client"` at the top.
  - Prefer small, focused components. Avoid prop drilling; use context only when
    state is truly shared.
  - Side effects belong in `useEffect`. Guard browser‑only APIs (e.g.,
    `localStorage`, `window`) using runtime checks.
- State/data:
  - Use React Query for network state. Choose stable `queryKey`s and set
    reasonable `staleTime`/`gcTime`.
  - Appwrite clients must come from `@/lib/appwrite` (`databases`, `storage`,
    `account`). Never re‑instantiate clients
    in components.
  - Axios requests must go through `@/lib/network` (shared instance) to
    centralize headers and error handling.
- Styling:
  - Use Tailwind utilities and existing UI components. Avoid inline styles
    unless dynamic and trivial.
  - Keep markup semantic and accessible (labels, roles, aria attributes).
- Logging & errors:
  - Use `@/lib/logger` (`log.debug|warn|error`). Do not leave `console.log` in
    app code.
  - Surface user‑facing errors via the toast system (`useToast`).

## Protobuf & Notes

- Frontend parsing uses `protobufjs` via `lib/proto.ts`. Always initialize types
  via `initProtobufTypes()` which loads
  `/static/notes.proto` at runtime and caches types.
- Never duplicate TypeScript interfaces for protobuf messages beyond what lives
  in `types/proto-types.ts` and
  `lib/proto.ts`. If the schema changes, update the proto file and keep the TS
  mirrors in sync.
- Backend changes to notes should be done through `notes_pb2.py` to keep parity
  with the `.proto`. Do not edit generated
  Python protobufs directly.
- When fetching binary note lists, request `arraybuffer`, decode with the cached
  `Type` (`NoteListType`,
  `ScoringResultType`).

## Score Renderers

- MusicXML:
  - Use `components/music-xml-renderer.tsx` (OSMD + SVG). Do not manipulate
    generated SVG directly—overlay UI should
    anchor to stable containers.
  - Resolve content through Appwrite Storage using
    `storage.getFileView(bucket, id)` and fall back to `getFileDownload`
    if `view` fails.
  - Support `.mxl` by extracting the embedded MusicXML (use JSZip logic already
    present).
- Image/PDF:
  - Use `components/image-score-renderer.tsx` (PDF.js
    SinglePageViewer/PDFViewer). Keep the container measurable and
    absolutely positioned as implemented to avoid PDF.js layout errors.
  - All zoom/page changes must emit the existing custom events (`score:zoomIn`,
    `score:zoomOut`, `score:zoomReset`,
    `score:pageChange`, `score:redrawAnnotations`). Do not rename these events.

## Environment & Appwrite

- Required public env vars (must be present when code depends on them):
  - `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT`
  - `NEXT_PUBLIC_DATABASE`, `NEXT_PUBLIC_SCORES_COLLECTION`
  - `NEXT_PUBLIC_SCORES_BUCKET` (score files), `NEXT_PUBLIC_FILES_BUCKET` (notes
    files)
- Never hard‑code IDs/URLs. Always compute Storage URLs via the Appwrite SDK.

## Testing (Playwright)

- Location: Place all E2E/integration tests in `frontend/tests` with `*.spec.ts`
  names.
- Config: `playwright.config.ts` is set to use `testDir: './tests'` and starts
  the dev server via the local Next binary.
  Do not change the test directory.
- Patterns:
  - Use `page.route` to mock Appwrite `databases`, `storage`, and `account`
    calls.
  - Load proto via the `/static/notes.proto` path or intercept it explicitly
    when needed.
  - Drive UI via existing custom events; for annotation redraws, dispatch
    `score:redrawAnnotations`.
  - Avoid flakiness: wait on visible, meaningful selectors and use `expect.poll`
    instead of arbitrary sleeps.
- Running: `cd frontend && pnpm test`. If you add tests, they must pass in
  Chromium and Firefox projects.

## Linting, Types, and CI Discipline

- ESLint is authoritative. The config enforces TypeScript compile diagnostics
  via `eslint-plugin-tsc`. Fix all reported
  issues.
- Keep TS config strictness intact. Do not weaken compiler options or eslint
  rules to “make it pass”. Solve root causes.
- Respect existing aliases and module resolution. Do not rewire path configs
  casually.

## Python (Backend)

- Prefer `numpy` for vectorized math when it is clearly faster and remains
  readable; otherwise use simple Python.
- Keep protobuf handling aligned with `notes_pb2.py`. Do not hand‑edit generated
  code.
- After changes, run the Flask server (`app_main.py`) to catch syntax and import
  issues early.

## Security & Secrets

- Never commit credentials or tokens. Use environment variables for secrets.
  `.env*` files are not for version control.
- Validate and sanitize user input at the boundary (server/API) and escape any
  dynamic HTML.

## Performance & UX

- Optimize re‑renders: memoize expensive computations and stabilize callback
  identities when a dependency array can
  enforce it.
- Avoid layout thrashing. Batch DOM reads/writes and prefer CSS transitions.
- Keep bundle size in check. Lazy load heavy libraries/routes when possible.

## Code Review Checklist

- Does it conform to `.editorconfig` and pass `pnpm run lint` with zero issues?
- Are tests added/updated in `frontend/tests` and passing in both browsers?
- Are Appwrite calls routed through shared clients and environment variables?
- Are protobuf types obtained via `initProtobufTypes` and decoded safely?
- Are logging and user‑visible errors handled appropriately?
- Is the change minimal, focused, and consistent with existing patterns?

## General Notes

- For the notes protobuf object, if there are only two elements for page sizes,
  then assume all pages are the same size.

These rules are strict by design. Changes that violate them should be treated as
regressions and corrected before merging.
