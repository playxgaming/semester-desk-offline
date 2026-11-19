# Verification and acceptance

```bash
npm ci
npm ci --prefix server
npx playwright install chromium
npm run verify
```

The runner builds and type-checks, then runs calculators, AI-server/bridge contracts, atomic writes, migration, backup/rollback, planner, notes/sources, quiz and quality-review data groups. `--core` stops after those checks. The full run adds source import, photo/scanned-PDF OCR, mocked AI note flows, quizzes, timetable/planning, CV snapshots, Search/Trash, onboarding, academic/life tools, Tutor, installation, offline routes, mathematical rendering, mobile navigation and the offline guide.

Tests use disposable profiles and synthetic material. No user's browser database, account credentials or live AI quota is used. The runner starts dev/preview on 5173/4173 if needed. Synthetic ChatGPT browser tests use 4768: stop the real connector before running them. Production assets must finish building before browser verification.

Logs and `results.json` are under ignored `node_modules/.release-verification/`; CI archives them with synthetic audit screenshots. Lint and coverage are not configured, so a passing run is not a coverage claim.

Native-export contract checks cover exact chunked Unicode, cancellation, cleanup, concurrent jobs and retry with an injected native transport. A real OCR job in simulated Android mode proves the plain language-model request. CI compiles the native bridge and checks its presence and the plain model inside the signed APK. Actual Android picker/print/reader interaction remains a physical-device acceptance check.

Offline-installer checks cover interrupted/stalled downloads, bounded retries, a visible manual retry action, recovery and reuse of an existing activated cache when update checks fail. Public hosting smoke checks also verify the real repository-path cache and local OCR after installation.

## Release gates

1. TypeScript, production/PWA build and complete release regression runner.
2. Root and optional-server production dependency audits.
3. Pages deployment from the verified commit.
4. Android assembly from that commit's verified web assets and stable signer.
5. Signature, package/version, bundled-asset checks and SHA-256 manifest.
6. Hosted-site HTTP and isolated-browser smoke checks.

Use [manual acceptance](../PILOT_ACCEPTANCE.md) for real-course quality and actual phone installation/upgrade, alarms and OCR memory. Mocked citations establish structure, not semantic truth. A signed APK establishes packaging identity, not device behaviour.

For documentation images serve production on 4173 and run `npm run docs:screenshots`. This captures only a new built-in demo profile.
