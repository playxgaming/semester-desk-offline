# Semester Desk development notes

## Stack and entry points

- React 18, strict TypeScript, Vite 7, React Router hash routing, Tailwind.
- `src/main.tsx` initializes storage/platform services; `src/App.tsx` owns routes.
- `src/routes/` owns screens; `src/components/ui.tsx` owns shared controls/modals.
- `src/index.css` and `tailwind.config.js` define theme tokens and styling.
- See `docs/ARCHITECTURE.md` for architecture and `docs/TESTING.md` for verification limits.

## Data and implementation conventions

- Dexie/IndexedDB is the local source of truth; Zustand holds UI state only.
- Use typed helpers in `src/db/mutate.ts` for ordinary entity writes and soft deletes.
- Filter tombstones on reads; active queues also exclude archived-course work.
- Wrap logically atomic multi-record changes in a Dexie transaction covering all affected stores.
- Use `src/db/attendance.ts` for attendance writes and date/slot resolution.
- Keep calculators and deterministic study logic in `src/lib/`.
- Preserve offline operation; all records and files stay on-device; AI features require an explicit online request.
- Put provider keys only on the backend, never in Vite variables or client storage.
- Attached file blobs are local-only and absent from CSV.
- Portable JSON v3 backups include validated file bytes; v2 imports remain supported.
- Components use PascalCase, helpers camelCase, database fields snake_case.
- TypeScript uses `@/` for imports from `src/`; no-unused checks are enabled.
- Follow existing token-based light/dark styles and mobile bottom-sheet conventions.

## Verification and delivery

- Install: `npm ci`; dev: `npm run dev`; build/typecheck: `npm run build`.
- Calculator/regression checks: `npm run check`.
- Backend: `npm ci --prefix server` then `npm test --prefix server`.
- Browser journeys live in `scripts/*.mjs`; require Playwright Chromium.
- Scripts differ between Vite dev port 5173 and production preview port 4173.
- There is no configured lint command. Do not imply browser or device validation
  from calculator checks or a successful build alone.
- Android uses Capacitor 6 runtime, CLI 7 tooling, JDK 17 and SDK 34; Windows uses `gradlew.bat`.
- CI gates Pages and a stable release-signed sideload APK on full verification of main. See `.github/workflows/release.yml`.
- No remote database, login or background data upload. Retired transport stores
  are dropped by database v3 without touching student records or files. Database v4 adds course_documents; v5 adds quiz_attempts; v6 adds manual quality_reviews with exact reviewed snapshots. Include new entity/snapshot fields in portable backup validation.
- `PILOT_SETUP.md` explains offline installation and optional AI setup.
- Keep portable backup v2 import compatibility; v3 includes attached file bytes.
