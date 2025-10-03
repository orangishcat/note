# Note

What if piano was a rhythm game?

## Frontend environment

Copy `frontend/.env.example` to `frontend/.env.local` and adjust values if
necessary. Use `pnpm` to install dependencies and run the dev server.

## Backend environment

Copy `backend/.env.example` to `backend/.env` and adjust values if necessary.
Use `uv` to install dependencies and run the dev server.

- Local development: `cd backend && python main.py serve`
- Beam deployment: ensure `BEAM_TOKEN` and required Appwrite/Beam environment
  variables are exported, then run `cd backend && python main.py deploy`
