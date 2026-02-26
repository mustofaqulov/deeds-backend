# Repository Guidelines

## Project Structure & Module Organization
- `src/app.js` configures Express middleware and mounts all API routes.
- `src/server.js` starts the local HTTP server.
- `src/routes/*.js` contains feature routes: `auth`, `profile`, `challenges`, `calendar`, and `prayer`.
- `src/middleware/auth.js` validates bearer tokens.
- `src/lib/supabase.js` centralizes Supabase client setup.
- `api/index.js` exports the app for Vercel runtime routing.
- `supabase/schema.sql` stores schema, RLS policies, and indexes.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run dev` runs the API with file watching (`node --watch src/server.js`).
- `npm start` runs the API in normal runtime mode.
- No compile/build step exists; this service runs directly on Node.js (>=18).
- Quick smoke test: `curl http://localhost:4000/api/health`.

## Coding Style & Naming Conventions
- Use ES modules (`import`/`export`) and keep files in plain `.js`.
- Follow existing formatting: 2-space indentation, semicolons, and single quotes.
- Keep route files lowercase and feature-based (example: `src/routes/profile.js`).
- Use `camelCase` for variables/functions and `UPPER_SNAKE_CASE` for constants (example: `PRAYERS`).
- Keep handlers small and consistent: validate input, execute Supabase query, return JSON.

## Testing Guidelines
- No automated test framework is configured yet.
- For every change, run local endpoint smoke tests for touched routes before opening a PR.
- Minimum manual checks should include:
  - success path
  - auth failure (`401`)
  - validation failure (`400`)
- If adding automated tests, use `*.test.js` naming and keep them close to the route/module under test.

## Commit & Pull Request Guidelines
- Match repository history style: conventional prefixes like `feat:` and `fix:`.
- Keep commit messages short, imperative, and scoped to one change.
- PRs should include:
  - purpose and behavior change summary
  - test evidence (command output or API checks)
  - any environment variable or `supabase/schema.sql` impact
  - linked issue/task when available

## Security & Configuration Tips
- Never commit real `.env` values; copy from `.env.example`.
- Treat `SUPABASE_SERVICE_ROLE_KEY` as secret and server-only.
- Restrict `FRONTEND_URL` in production instead of using wildcard origins.
