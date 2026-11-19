# Semester Desk: local setup

No cloud database, account or login is required. All records, notes, AI conversation history and attached files are saved on this device.

## Run the app

1. Install Node.js 22.13 or newer and run `npm ci` in the project directory.
2. Run `npm run dev` and open the printed local URL.
3. Complete onboarding or choose Skip to explore the sample semester.
4. For a production offline browser installation, run `npm run build` and `npm run preview`, load it once online, and install it from the Install page. Development mode is not an offline installation.
5. For Android packaging, follow ANDROID.md.

## Protect your work

- Settings shows local storage use and lets you request persistent browser storage where supported.
- Export a complete JSON backup regularly, including attached files. Keep the exported file outside this browser/app storage.
- Import that backup on another device to transfer your work manually.
- Back up before clearing site data, uninstalling, changing browser profiles or replacing an Android installation.
- CSV is useful for spreadsheets but does not contain file bytes. Old v2 JSON backups also lack file bytes; import reports missing attachments.
- Dates and reminders follow your device time zone. Today and planning respect configured term bounds. The weekly timetable remains an editable recurrence template.

## Optional online tools

The academic core, planner, notes, cards, deterministic Coach, focus timer, money and career tools work locally. AI inference and holiday imports require internet; they do not upload your whole database.

For the Windows ChatGPT connection, follow CHATGPT_CONNECTION.md. Open its local window to authorize your ChatGPT account. The account connection is separate from your student records.

For optional Gemini/Groq hosting, follow AI_SETUP.md. Provider secrets belong only in the backend environment, never in frontend variables or chat. Public shared AI hosting still needs access controls and spending limits; keep owner-funded endpoints private until hardened.

The scanner offers optional Gemini image AI and bundled local English OCR. Local recognition, crop/rotation and reviewed/manual timetable rows need no API key; install/load the production app's offline assets first (about 21 MiB for app, PDF and OCR support). Review all recognized text and extracted rows. Holiday import is optional, and holidays can also be entered manually.

## New browser tools

- Course → Import syllabus / Add reference material → Read photo or scanned PDF locally.
- Timetable → Scan Document → Image processing → Local English OCR, then review sections, teaching weeks and conflicts.
- Notes → AI notes → choose topic, provider, format/level and source excerpts. Use Make cards to edit proposed questions/answers before adding them.
- Coach → Quiz me → history to resume an unfinished quiz or approve revision blocks from mistakes.
- Planner → Study hours to enable timed availability windows and exact deadline-time planning.
- Search and Trash to find full content and restore deleted records.
- Quality reviews to check notes and extracted documents against course material, retain exact reviewed versions, flag changed content and export a local pilot report.
- Settings → Import to preview backup conflicts. Keep-device mode is the default; choose explicit replacement when restoring saved profile settings and records into a fresh test profile.

Follow PILOT_ACCEPTANCE.md for browser acceptance. Android device checks and real-course AI factual review remain separate.

Android scheduled notifications need device permission. Web browsers cannot run this app's scheduled alarms while closed. APK installation, upgrades and OEM alarm behavior need a real-phone check.
