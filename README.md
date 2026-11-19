<p align="center"><img src="docs/images/zenith-banner.svg" alt="Semester Desk — your semester, under control. Created by Sarvesh Sehra." width="100%"></p>

<p align="center"><a href="https://playxgaming.github.io/semester-desk-offline/"><strong>Launch web app ↗</strong></a> · <a href="https://github.com/playxgaming/semester-desk-offline/releases/latest/download/semester-desk.apk"><strong>Get Android APK ↗</strong></a> · <a href="docs/USER_GUIDE.md"><strong>Field manual</strong></a> · <a href="LICENSE"><strong>Usage &amp; permissions</strong></a></p>

<p align="center"><a href="https://github.com/playxgaming/semester-desk-offline/actions/workflows/release.yml"><img alt="Release verification" src="https://github.com/playxgaming/semester-desk-offline/actions/workflows/release.yml/badge.svg"></a> <img alt="Version 3.0.2" src="https://img.shields.io/badge/version-3.0.2-27654b"> <img alt="Offline first" src="https://img.shields.io/badge/offline-first-3e785d"> <img alt="Web and Android" src="https://img.shields.io/badge/web_%2B-Android-4b70a1"> <img alt="No account required" src="https://img.shields.io/badge/account-not_required-80612b"></p>

**One local workspace for classes, notes, revision, planning and student life.** Semester Desk is an offline-first React PWA and signed Android sideload app. Your study data and files live on your device. No account, remote database or background sync is required.

AI is optional. Local English OCR, flashcards, quizzes, calculations and planning work without a model. Connected AI sends only explicitly selected requests and context through your chosen connection.

## Your semester, from capture to completion

```mermaid
flowchart LR
    A["01 · Capture<br/>Syllabus / PDF / timetable photo"] --> B["02 · Review<br/>Topics, sources and conflicts"]
    B --> C["03 · Plan<br/>Real time, real deadlines"]
    C --> D["04 · Learn<br/>Notes → cards → quizzes"]
    D --> E["05 · Recover<br/>Catch-up, reviews and backup"]
    style A fill:#102d23,stroke:#b4f875,color:#edf5ee
    style B fill:#102d23,stroke:#b4f875,color:#edf5ee
    style C fill:#102d23,stroke:#b4f875,color:#edf5ee
    style D fill:#102d23,stroke:#b4f875,color:#edf5ee
    style E fill:#102d23,stroke:#b4f875,color:#edf5ee
```

| Mission | What you can do | Open the guide |
| :--- | :--- | :--- |
| **Take command of the week** | Review your timetable, check attendance and see deadlines together. | [Academic tools](docs/USER_GUIDE.md) |
| **Turn sources into understanding** | Import a syllabus, review OCR, write notes and practise with cards and quizzes. | [Learning workflow](docs/USER_GUIDE.md) |
| **Make the plan survivable** | Preview realistic study time, inspect overload and recover missed work. | [Planning and Focus](docs/USER_GUIDE.md) |
| **Keep ownership** | Use core tools offline and export complete backups with original files. | [Backup and restore](docs/USER_GUIDE.md) |

## Inside mission control

![Today dashboard with the built-in demo semester](docs/images/today.png)

<table>
<tr><td width="50%"><img src="docs/images/timetable.png" alt="Weekly timetable"><p align="center">A week you can see clearly</p></td><td width="50%"><img src="docs/images/notes.png" alt="Notes and mathematical notation"><p align="center">Notes you can edit and verify</p></td></tr>
<tr><td><img src="docs/images/planner.png" alt="Study planner"><p align="center">Study time that respects your calendar</p></td><td><img src="docs/images/quality.png" alt="Quality reviews"><p align="center">Evidence of what you checked</p></td></tr>
</table>

Screenshots show a disposable demo profile, not real student records or live AI output. [Full illustrated guide →](docs/USER_GUIDE.md)

## Scan your next step

<table>
<tr><th>Repository</th><th>Web app</th><th>Android APK</th></tr>
<tr><td align="center"><a href="https://github.com/playxgaming/semester-desk-offline"><img src="docs/images/qr/repository.png" width="170" alt="QR: GitHub repository"></a></td><td align="center"><a href="https://playxgaming.github.io/semester-desk-offline/"><img src="docs/images/qr/website.png" width="170" alt="QR: open the website"></a></td><td align="center"><a href="https://github.com/playxgaming/semester-desk-offline/releases/latest/download/semester-desk.apk"><img src="docs/images/qr/android.png" width="170" alt="QR: download the latest signed APK"></a></td></tr>
<tr><td align="center">Source + usage guide</td><td align="center">Open in your browser</td><td align="center">Latest signed download</td></tr>
</table>

## What is included

| Workspace | Tools |
| --- | --- |
| **Academic** | Courses, semesters, weekly/alternating classes, exceptions, attendance, deadlines/subtasks, weighted grades and GPA. |
| **Sources** | Reviewed syllabus/reference imports, text PDFs, original files, cropped/rotated photo and scanned-PDF English OCR, timetable conflict checks and optional image AI. |
| **Learning** | Markdown/LaTeX notes, local drafts/history, source-linked AI drafts, editable flashcards, spaced repetition, saved quizzes, mistakes and approved revision work. |
| **Planning** | Daily capacity or timed study windows, class/deadline-aware previews, protected atomic saves, catch-up, overload reporting, recoverable Focus and deterministic Coach. |
| **Quality** | Manual accuracy/coverage/readability/source checks, exact reviewed snapshots, changed-content flags and pilot reports. |
| **Career & life** | Applications/contacts, CV variants and frozen submission snapshots, expenses, budgets, anchored recurring bills and habits. |
| **Ownership** | Full-content Search/Trash, portable JSON backups with original files and hashes, conflict-previewed imports and CSV records. |
| **Everywhere** | Responsive PWA, signed Android APK, bundled offline OCR, native reminders and an offline usage guide. |

## Start using it

1. **[Open the website](https://playxgaming.github.io/semester-desk-offline/)** or **[download the Android APK](https://github.com/playxgaming/semester-desk-offline/releases/latest/download/semester-desk.apk)**.
2. Complete setup or explore the demo. Use **Settings → Reset and start empty** when ready for your own records; export anything you want to retain first.
3. Add courses, check your imported timetable/syllabus, then add upcoming deadlines.
4. Preview and save a Planner schedule. Turn notes into reviewed cards and Coach quizzes.
5. Export a complete JSON backup outside browser storage.

Let the website cache its assets once; **Install app** shows readiness. The APK bundles offline assets. Install the PWA from Chrome/Edge, or Safari → Share → Add to Home Screen on iPhone/iPad. On phones, **More** reveals all tools.

> **Moving from the old site or APK?** Export a complete JSON backup first. The old and new GitHub Pages sites share an origin and database name, so this site can retain and upgrade those existing records; use the latest build after upgrading. Other devices, profiles, local ports and Android need backup/import to transfer data. Replacing an old debug-signed APK may require reinstalling, which deletes app data. [Migration and installation →](ANDROID.md)

## Run locally

Use **Node.js 22.13+**. No account or API key is needed for the core app.

```bash
npm ci
npm run dev
```

For the production build:

```bash
npm run build
npm run preview
```

The first launch seeds a worked demo semester. Reset deliberately when ready to enter your own data. Back up before resetting, reinstalling or clearing site storage.

## Optional AI

| Connection | Where | Capabilities |
| --- | --- | --- |
| None | Web, PWA, Android | All local tools, English OCR, Coach, cards and quizzes. |
| Windows ChatGPT connector | Its local app window | Interactive plan sign-in, text Tutor and source-linked notes. |
| Your Gemini backend | Website / APK with HTTPS backend configured | Text Tutor, source-linked notes and image extraction. |
| Your Groq backend | Website / APK with HTTPS backend configured | Alternative text Tutor and source-linked notes. |

[ChatGPT guide](CHATGPT_CONNECTION.md) · [AI/backend setup](AI_SETUP.md) · [Pilot setup](PILOT_SETUP.md)

GitHub Pages serves the frontend, not the optional Node server. A ChatGPT subscription is not an API key for the website/APK. Provider keys stay on your backend. Free tiers, models and quotas may change; no unlimited inference is bundled. Review AI facts and equations against your course material.

## Verify and release

```bash
npm ci --prefix server
npx playwright install chromium
npm run verify                 # build + all release regression groups
npm run verify -- --core        # build + data/calculation/contract checks
npm run docs:screenshots        # fresh demo screenshots; preview on 4173
npm run android:release         # JDK 17, SDK 34 + private signing environment
```

The release workflow gates **website deployment and signed APK publishing** on the same verification. Android uses the exact verified web assets, an increasing version code and stable private signer. Releases include checksums, package/signature evidence and the complete source ZIP.

[Testing](docs/TESTING.md) · [Deployment and rollback](DEPLOYMENT.md) · [Android builds](ANDROID.md) · [Changelog](CHANGELOG.md) · [Architecture](docs/ARCHITECTURE.md)

AI tests use synthetic providers and do not certify factual accuracy. Browser tests do not prove physical Android install/upgrade, closed-app alarms or low-memory OCR behaviour. This is an Android sideload release, not a Play Store listing. [Manual acceptance →](PILOT_ACCEPTANCE.md)

## Project map

```text
src/routes/           Student tools and offline guide
src/components/       UI, imports, provider connections and review workflows
src/db/               Local schema, atomic writes, files and recovery
src/lib/              Calculations, planning, OCR/PDF, backups and providers
server/               Optional AI proxy; provider keys stay on the server
scripts/              Verification, browser checks and Windows connector
android/              Capacitor wrapper and signing integration
docs/                 Illustrated guide, screenshots, testing and architecture
.github/workflows/    Verified website and signed APK publishing
```

React · TypeScript · Vite · Tailwind · Dexie · Capacitor · KaTeX · PDF.js · Tesseract.js. Upstream dependencies retain their respective licences; generated offline assets retain upstream notices.

## Copyright and permissions

**Copyright © 2026 Sarvesh Sehra. All rights reserved in the original work.**

Semester Desk is **source-available under custom personal-use terms**, not an open-source licence. You may use the app for your own study and inspect or privately test the source under the [licence](LICENSE). Reuse, redistribution, commercial use, and submission of the original code or assets in another hackathon, competition or portfolio require prior written permission. Attribution alone does not grant permission. Do not remove copyright notices or present this project as your own work.

Third-party components retain their own licences. GitHub's platform permissions and rights required by law are unaffected. [Copyright, scope and permission requests →](COPYRIGHT.md)

## Help and contributions

[Usage guide](docs/USER_GUIDE.md) · [Troubleshooting](docs/USER_GUIDE.md#troubleshooting) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

Report the visible version, affected tool, steps and a minimal synthetic example. Remove personal data, provider credentials and sign-in material from reports and screenshots.

---

<p align="center"><strong>Created by Sarvesh Sehra</strong><br><sub>Build your semester. Keep your data. Own the next step.</sub></p>
