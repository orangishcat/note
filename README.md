# Note

AI to help with piano practice

## Frontend environment

Copy `frontend/.env.example` to `frontend/.env.local` and adjust values if
necessary.

## Package Manager

Use pnpm for all Node workflows.

- Install deps: `cd frontend && pnpm install`
- Dev server: `cd frontend && pnpm run dev`
- Lint + typecheck: `cd frontend && pnpm run lint`
- Tests (Chromium + Firefox): `cd frontend && pnpm test`

Note: npm and yarn are not used. `package-lock.json` has been removed in favor
of `pnpm-lock.yaml`.
