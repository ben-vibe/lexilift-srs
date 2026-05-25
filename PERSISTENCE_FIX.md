# Local persistence fix — LexiLift SRS

## Phase 1 — What existed before

| Item | Detail |
|------|--------|
| **API** | `window.localStorage` only |
| **Keys** | `lexilift-progress-v3`, `lexilift-custom-words-v3`, `lexilift-settings-v3` |
| **Data shape** | Progress: `Record<wordId, WordProgress>`; custom words: `AppWord[]`; settings: `{ isReverse, selectedCategory }` |
| **Read** | `readLocalStorage()` in `src/App.tsx` — synchronous `JSON.parse` on init |
| **Write** | Three `useEffect` hooks calling `localStorage.setItem` when state changed |
| **Risk** | On parse error, `readLocalStorage` returned `{}` / `[]` **silently**, which could look like lost progress |

Cloud/Supabase code was **not modified** (same calls, gated on `localPersistReady` so hydration finishes before DB upsert).

---

## Phase 2 — What changed

### New file: `src/lib/localPersistence.ts`

- **Primary store:** IndexedDB database `lexilift-local`, object store `kv`, keys `snapshot-v4` + `snapshot-v4-backup`.
- **Mirror / migration:** Still writes legacy v3 `localStorage` keys plus `lexilift-snapshot-v4` and `lexilift-snapshot-v4-backup` so data survives if IDB is blocked and old installs migrate forward.
- **Load order:** Bootstrap sync read → async IDB load → merge all sources (newest `savedAt` wins for settings/custom words; progress keys unioned).
- **Corruption:** Invalid JSON logs a warning, skips bad fields, tries backup snapshot; never returns empty without attempting backups.
- **Quota:** Catches `QuotaExceededError` on mirror writes; keeps IndexedDB copy when possible.
- **Writes:** Serialized queue so rapid swipes do not interleave corrupt snapshots.
- **Reset / sign-out helpers:** `clearAllLocalUserData()`, `clearPersistedProgress()` (progress only, same as before for sign-out).

### Updated: `src/App.tsx`

- Initial state from `readBootstrapSnapshot()` (instant paint).
- `loadPersistedSnapshot()` on mount hydrates from IDB and migrates legacy data.
- `localPersistReady` state gates persist + existing Supabase upsert effects.
- Single `persistUserState({ progress, customWords, settings })` replaces three `setItem` effects.
- `resetDemo` calls `clearAllLocalUserData()`; sign-out calls `clearPersistedProgress()` instead of only `removeItem` on one key.

### Helper script (optional): `scripts/verify-local-persistence.mjs`

Headless Playwright checks; not required to run the app.

---

## Phase 3 — Verification

**Environment:** Node v20.20.2, `npm run dev` at `http://localhost:5173/`, no `.env` (offline guest mode).

| Command | Result |
|---------|--------|
| `npm run build` | **Pass** — `dist/index.html` ~744 KB |
| `npm run dev` (Node 20) | **Pass** — Vite ready |

**Automated scenarios** (`node scripts/verify-local-persistence.mjs` with dev server running):

| # | Scenario | Result |
|---|----------|--------|
| 1 | Study → refresh | **Pass** — progress count persisted (`legacyCount` 1 → 1) |
| 2 | Study → reload → revisit same profile | **Pass** — 2 reviewed words kept |
| 3 | Returning session (same browser profile) | **Pass** — stored progress reloads |
| 4 | Empty `localStorage` + cleared IDB | **Pass** — Dashboard loads, no JS errors |
| 5 | Corrupted v3 keys + valid v4 backup | **Pass** — no crash; app usable |

**Manual note:** Playwright “close browser and reopen” is the same as scenario 2 when using one browser profile. A **new** browser profile (incognito / different device) naturally has no data — that is expected for local-only storage.

**Offline / no login:** Verified — no Supabase env vars; app runs from bundled words + local persistence only.

---

## 6. PWA installability & persistent storage

### PWA setup (unchanged — verified, not rebuilt)

| Requirement | Status | Location |
|-------------|--------|----------|
| Web app manifest linked | OK | `index.html` → `/manifest.webmanifest` |
| `display: standalone` | OK | `public/manifest.webmanifest` |
| `start_url` + `scope` | OK | `/` |
| Name + short_name | OK | LexiLift / LexiLift SRS |
| Theme / background colors | OK | `#020617` / `#f5efe4` |
| Icon (512×512) | OK | PNG URL in manifest (third-party CDN) |
| Service worker registered | OK | `src/main.tsx` registers `/sw.js` on `load` |
| Theme color meta | OK | `index.html` |

**Conclusion:** The existing manifest + service worker setup is **valid for install-to-home-screen** on Chromium and Safari (over HTTPS or `localhost`). No PWA files were modified in this pass.

**Caveats (informational only):**

- Install prompt still depends on browser heuristics (engagement, HTTPS, etc.).
- The icon is loaded from an external CDN; some stores/TWA pipelines prefer same-origin icons — optional future improvement, not required for basic install.
- `public/sw.js` only precaches `/`; the app shell is served by the network on first load (acceptable for this Vite SPA).

### `navigator.storage.persist()` (added)

| Item | Detail |
|------|--------|
| **Code** | `src/lib/storagePersistence.ts` — `requestPersistentStorage()` |
| **When** | Called once at startup from `src/main.tsx` (before render) |
| **If unsupported** | Returns `{ supported: false, granted: false }`; app unchanged |
| **If denied** | Returns `{ supported: true, granted: false }`; app unchanged |
| **If granted** | Returns `{ supported: true, granted: true }`; IndexedDB/localStorage less likely evicted under disk pressure |
| **Errors** | Caught and logged; never blocks startup |

### Persistent storage grant (automated check, May 25 2026)

Run with dev server on Node 20 (`http://localhost:5173/`), headless Chromium:

| Check | Result |
|-------|--------|
| Manifest fetch + JSON fields | **Pass** |
| `display: standalone`, icon 512 | **Pass** |
| Service worker `navigator.serviceWorker.controller` after load | **Pass** (registered) |
| `navigator.storage.persist()` supported | **Pass** (Chromium) |
| **`persist()` granted** | **Denied** in headless/automation (expected — browsers often refuse without user engagement) |
| App loads after request | **Pass** |

**Report for product owner:** Persistent storage is **requested on every launch**. In normal use on a phone/desktop, the user may be **granted** persistence after install or repeated visits; denial does **not** break saving progress. To see grant status on a device: DevTools → Application → Storage → “Persistent” checkbox, or console in dev build (`[LexiLift] Persistent storage:` log).

---

## Caveats for the product owner

1. **Local-only:** Progress lives on **this device and browser**. Clearing site data, uninstalling the PWA, or using a different browser still erases progress.
2. **Private / strict modes:** If IndexedDB is disabled, the app falls back to `localStorage` mirrors (still durable for typical deck sizes).
3. **Sign out (Google):** Still clears **progress** locally (unchanged product behavior); custom words and settings remain unless you use **Reset progress** / **Delete account**, which clears everything local.
4. **Browser restart:** Same as reload — data remains as long as the browser profile is unchanged.
5. **Cloud sync:** Unchanged by this work; fixing Supabase `word_id` mismatch is a separate task (see `ARCHITECTURE_REVIEW.md`).

---

## Files touched

- `src/lib/localPersistence.ts` (new)
- `src/lib/storagePersistence.ts` (persistent storage request)
- `src/main.tsx` (startup persist request)
- `src/App.tsx` (local persistence wiring only)
- `scripts/verify-local-persistence.mjs` (verification helper)
- `PERSISTENCE_FIX.md` (this document)
