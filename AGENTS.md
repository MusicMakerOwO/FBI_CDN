# AGENTS.md — Fox Box Insurance CDN

## ⚠️ Migration Status
This project is **currently in transition** from SQLite-only metadata storage to **MariaDB + Cloudflare R2**, but the runtime has already moved to MariaDB.
- **Legacy Source:** SQLite (`cdn.sqlite`) is read by the migration CLI in `src/port.ts`
- **Runtime Path:** MariaDB (`src/Database.ts`) + local `Files/` directory + Cloudflare R2 (`src/Cloud.ts`)
- **Current State:** Uploads write metadata to MariaDB, store bytes locally, then replicate the same key to R2; reads use `CDN.location` to decide local vs cloud fetch

**When implementing features or changes, ask yourself:** Does this affect the runtime MariaDB/local+R2 path, the SQLite-to-MariaDB porting flow in `src/port.ts`, or both during transition?

## Project Overview
- **Purpose:** This service is a CDN (Content Delivery Network) for Fox Box Insurance (FBI), focused on secure, transparent, and user-empowered file storage and retrieval for Discord communities.
- **Architecture:**
  - **Express.js API** (see `src/index.ts`) exposes `/upload`, `/fetch/:lookup`, and `/download/:lookup`.
  - **⚠️ Migration in Progress:** SQLite still exists as the source for the porting CLI in `src/port.ts`, but runtime metadata access goes through MariaDB in `src/Database.ts`.
  - **File Storage:** Currently hybrid — `AddFile()` writes to `Files/` and then uploads the same generated key to Cloudflare R2.
  - **MIME Type Detection:** Whitelist-based content type derivation for cloud uploads.

## Key Components
- **API Entrypoint:** `src/index.ts`
  - Handles CORS, raw body parsing, request logging, and environment config.
  - Requires `ACCESS_KEY` in `.env` for secure access.
  - Implements timing-attack-resistant string comparison for sensitive operations.
  - Uploads are capped at 100 MB and require the `key` and `file-name` headers.
  - `/fetch/:lookup` and `/download/:lookup` strip any dotted suffix from `:lookup`, so `/fetch/<key>.png` still resolves the same file.
- **File Management:** `src/LocalFileManagement.ts`
  - `AddFile`: Sanitizes filenames, hashes file data, deduplicates by `CDN.hash`, writes the file to local disk, inserts a MariaDB row with `location='local'`, then calls `Cloud.Upload(fileName, data, key)`.
  - `AddFile` returns a 16-character nanoid key from `CDN.key`, not a `hash+id` lookup.
  - `GetFile`: Reads metadata from MariaDB by `key`, then loads bytes from `Files/` when `location === 'local'` or from R2 via `Cloud.Fetch()` when `location === 'cloud'`.
  - `SanitizeFileName`: Strips all characters except alphanumeric, underscore, dot, and dash.
- **Cloud Storage:** `src/Cloud.ts`
  - ✅ **Target** — Uploads files to Cloudflare R2 (AWS S3 compatible).
  - `Upload()` accepts an optional `keyOverride`; `AddFile()` passes the local `CDN.key` so local and cloud use the same identifier during migration.
  - `Fetch()` reads from the public R2 bucket URL; `Delete()` and `destroy()` are also exposed.
  - Cloud uploads do **not** currently insert or update MariaDB rows themselves; the DB write happens in `AddFile()` first.
  - Uses nanoid (16 chars) for collision-resistant cloud key generation.
  - **Note:** Cloud credentials are effectively required for the current upload path because `AddFile()` awaits `Cloud.Upload()`.
- **Content Type Detection:** `src/ContentType.ts`
  - Derives MIME type from filename using `mime-types` library.
  - Whitelist-based: only allows common MIME prefixes (text/, image/, audio/, video/) and known application types.
  - Defaults to `application/octet-stream` for unknown/uncommon extensions.
- **Database Abstraction:**
  - **MariaDB (`src/Database.ts`):** ✅ **Runtime** — Centralized metadata storage for the running server.
    - Connection pooling with 10-second timeout warnings for leaked connections.
    - Exposes `query()`, `batch()`, `transaction()`, `getConnection()`, and `releaseConnection()`.
    - Table `CDN`: Stores `filename`, `type`, `hash`, `key`, and `location`.
    - **Note:** `MARIADB_URI` is required for runtime startup; `Database.Initialize()` exits the process when it is missing.
  - **SQLite (`cdn.sqlite` via `src/port.ts`):** ⚠️ **Legacy Migration Source** — Read with `better-sqlite3` during porting from the old `Files` table into MariaDB's `CDN` table.
  - **Types (`src/DatabaseTypes.ts`):** Defines `SimpleFile` type for type-safe DB access.
- **Logging:** `src/Log.ts`
  - Color-coded, aligned logs for different event types (INFO, WARN, ERROR, etc.).

## Developer Workflows
- **Build:** `npm run build` (TypeScript, output to `build/`)
- **Start:** `npm start` (runs built server)
- **Test:** `npm test` (uses Vitest, see `src/Tests/`; runs serially because `vitest.config.ts` sets `fileParallelism: false`)
- **Type Checking:** `npm run check`
- **Line Count:** `npm run linecount`
- **Port Legacy SQLite Data:** `npm run port -- --help` (reads `cdn.sqlite` and migrates `Files` rows into MariaDB `CDN` rows)
- **Environment:** `.env` must provide `ACCESS_KEY` for the HTTP server, `MARIADB_URI` for all DB-backed paths, and R2 credentials for uploads/tests that call `AddFile()`.

## Project Conventions & Patterns
- **File Identifiers:** All file access is via the generated `key` stored in `CDN.key`. This is currently a 16-character nanoid, not the old `hash+id` lookup.
- **File Storage:** 
  - **Legacy:** SQLite data in `cdn.sqlite` is still the source for `src/port.ts`.
  - **Runtime:** Files are still stored locally by SHA-256 hash in `Files/` (for example `Files/<sha256>`), while MariaDB tracks the public `key` and `location`.
  - **Current:** `AddFile()` writes locally first, inserts `location='local'`, then uploads to R2 using the same `key`.
- **Filename Sanitization:** `SanitizeFileName()` removes all characters except `[a-zA-Z0-9_.-]`. Apply this in `AddFile()` before storing filename in DB.
- **Cloud Upload:** `AddFile()` currently awaits `Cloud.Upload()`; upload failures will fail the request instead of being fire-and-forget. `Cloud.Upload()` derives the R2 `ContentType` via `DeriveContentType()`.
- **Database Abstraction:** 
  - **⚠️ Transition State:** Runtime DB access is MariaDB-only through `src/Database.ts`; SQLite is only used by the migration script in `src/port.ts`.
  - Use `Database.query()` for simple queries and `Database.transaction()` / `Database.getConnection()` when you need explicit transaction boundaries.
  - `DB_SETUP.sql` now documents the MariaDB `CDN` table shape used by the runtime.
- **MIME Type Handling:** Use `DeriveContentType(fileName)` to safely map file extensions to MIME types. Whitelists common types; defaults to `application/octet-stream` to prevent abuse.
- **Testing:** The current tests are integration-style, not mocked. `src/Tests/LocalFileManagement.test.ts` loads `.env`, writes into `Files/`, touches MariaDB through `Database.query()`, and depends on the real upload path succeeding.
- **Constants:** All paths and configuration in `src/Constants.ts`. `DB_FILE` is still used by `src/port.ts`, and `FILES_FOLDER` is used by both runtime code and tests.
- **Environment Setup:**
  - **Required:** `ACCESS_KEY` (for API authentication)
  - **Required (Runtime DB):** `MARIADB_URI` (MariaDB connection string)
  - **Required (Upload Path):** `R2_ACCESS_KEY`, `R2_SECRET_KEY` (Cloudflare R2 credentials)
  - **Transition Note:** SQLite is no longer part of the runtime request path, but it is still required if you need to port legacy records with `src/port.ts`.

## Integration Points
- **External Services:**
  - **Discord:** Referenced in README; not directly integrated in this repo (integration happens in the Bot/API services).
  - **Cloudflare R2:** ✅ **Active** — Used by `src/Cloud.ts` for uploads and cloud fetches.
  - **MariaDB:** ✅ **Active** — Used by the runtime server through `src/Database.ts`.
  - ⚠️ **Legacy:** SQLite is now a migration input for `src/port.ts`; local file storage in `Files/` is still active at runtime.
- **FBI Services:**
  - [Bot](https://github.com/MusicMakerOwO/FoxBoxInsurance) — Calls CDN endpoints to upload/retrieve files.
  - [API](https://github.com/MusicMakerOwO/FBI_API) — Additional service endpoints.
  - [Docs](https://github.com/MusicMakerOwO/FBI_Docs) — Documentation.
- **Environment Variables:**
  - `ACCESS_KEY` — Required. Secret API key for `/upload` endpoint protection.
  - `R2_ACCESS_KEY`, `R2_SECRET_KEY` — Required for the current upload path and the integration-style tests that call `AddFile()`.
  - `MARIADB_URI` — Required for runtime and tests. MariaDB connection string (e.g., `mariadb://user:password@host:3306/database`).

## Examples
- **AddFile:**
  - Input: filename, file buffer
  - Output: unique `CDN.key` string
- **GetFile:**
  - Input: key string
  - Output: file buffer, filename, hash (or `null` if metadata or file bytes are missing)

## Key Files/Directories
- `src/index.ts` — HTTP API server and route handlers
- `src/LocalFileManagement.ts` — File storage logic (local disk + cloud)
- `src/Cloud.ts` — AWS S3/Cloudflare R2 cloud storage integration
- `src/ContentType.ts` — MIME type detection utility
- `src/Database.ts` — MariaDB connection pool and query helper
- `src/DatabaseTypes.ts` — TypeScript definitions for database records
- `src/Constants.ts` — Path constants (ROOT_FOLDER, FILES_FOLDER, DB_SETUP_FILE, DB_FILE)
- `src/port.ts` — One-off CLI for porting legacy SQLite `Files` rows into MariaDB `CDN` rows
- `src/Log.ts` — Structured logging utility
- `src/Tests/` — Vitest test suites (currently integration-style for `LocalFileManagement` plus pure unit tests for `ContentType`)
- `vitest.config.ts` — Test discovery config; disables file-level parallelism
- `Files/` — Local file storage (files stored as SHA-256 hex hashes, no extension)
- `DB_SETUP.sql` — MariaDB `CDN` schema
- `.env` — Required environment variables (`ACCESS_KEY`, `MARIADB_URI`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`)

---
For more, see [README.md] and FBI Docs repo.