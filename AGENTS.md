# AGENTS.md — Fox Box Insurance CDN

## Project Overview
- **Purpose:** This service is a CDN (Content Delivery Network) for Fox Box Insurance (FBI), focused on secure, transparent, and user-empowered file storage and retrieval for Discord communities.
- **Architecture:**
  - **Express.js API** (see `src/index.ts`) exposes endpoints for file upload, download, and management.
  - **SQLite Database** (see `cdn.sqlite`, `src/Database.ts`, `DB_SETUP.sql`) stores file metadata, download limits, and access logs.
  - **File Storage:** All files are stored in the `Files/` directory, named by their SHA-256 hash.
  - **File Cache:** In-memory cache (`src/FileCache.ts`) optimizes file retrieval and memory usage.

## Key Components
- **API Entrypoint:** `src/index.ts`
  - Handles CORS, raw body parsing, and environment config.
  - Requires `ACCESS_KEY` in `.env` for secure access.
  - Implements timing-attack-resistant string comparison for sensitive operations.
- **File Management:** `src/FileManagement.ts`
  - `AddFile`: Sanitizes filenames, hashes file data, checks for deduplication, writes to disk, and inserts metadata into DB.
  - `GetFile`: Retrieves file by lookup, enforces download limits, and uses cache for performance.
- **Database:** `src/Database.ts`, `DB_SETUP.sql`
  - Custom SQL loader parses and executes multi-line and transactional SQL from `DB_SETUP.sql`.
  - Table `Files` (see `DB_SETUP.sql`):
    - `lookup` is a virtual column: `hash || id` (used as unique file identifier for access).
    - `download_limit` can be null (unlimited) or decremented on each download.
    - Timestamps are stored in ISO 8601 format.
- **File Cache:** `src/FileCache.ts`
  - Configurable by file count and memory size.
  - Prunes largest files first to stay under memory limits.
  - Throws if a file exceeds max memory.
- **Logging:** `src/Log.ts`
  - Color-coded, aligned logs for different event types (INFO, WARN, ERROR, etc.).

## Developer Workflows
- **Build:** `npm run build` (TypeScript, output to `build/`)
- **Start:** `npm start` (runs built server)
- **Test:** `npm test` (uses Vitest, see `src/Tests/`)
- **Type Checking:** `npm run check`
- **Line Count:** `npm run linecount`
- **Environment:** Requires `.env` with `ACCESS_KEY` (see error in `src/index.ts` if missing)

## Project Conventions & Patterns
- **File Identifiers:** All file access is via the `lookup` (hash+id), not raw hash or filename.
- **Filename Sanitization:** Only alphanumeric, underscore, dot, and dash allowed in filenames.
- **Cache Usage:** Always check cache before disk/database for file reads.
- **SQL:** Use `DB_SETUP.sql` for schema changes; `src/Database.ts` parses and applies it.
- **Testing:** Use Vitest with mocks for DB and filesystem (see `src/Tests/`).
- **Constants:** All paths and config in `src/Constants.ts`.

## Integration Points
- **External:**
  - Discord (see README for context, not direct integration in this repo)
  - Other FBI services: [Bot](https://github.com/MusicMakerOwO/FoxBoxInsurance), [API](https://github.com/MusicMakerOwO/FBI_API)
- **Environment Variables:** `.env` (must include `ACCESS_KEY`)

## Examples
- **AddFile:**
  - Input: filename, maxDownloads, file buffer
  - Output: unique lookup string (hash+id)
- **GetFile:**
  - Input: lookup string, decrement_download flag
  - Output: file buffer, filename, hash (or null if not found/limit reached)

## Key Files/Directories
- `src/index.ts` — API server
- `src/FileManagement.ts` — File add/retrieve logic
- `src/Database.ts`, `DB_SETUP.sql` — DB schema/logic
- `src/FileCache.ts` — In-memory cache
- `src/Tests/` — Vitest tests
- `Files/` — File storage
- `.env` — Required for server start

---
For more, see [README.md] and FBI Docs repo.