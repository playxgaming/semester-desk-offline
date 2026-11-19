# Changelog

## 3.0.1

- Android exports use the system save-file picker for backups, CSV, DOCX, Markdown, quality reports and original source files, with bounded transfer chunks and explicit cancellation/error handling.
- Android resume printing opens the native print dialog; non-image attachments can be saved as a copy through the file picker.
- Native OCR ships a deliberate uncompressed English language model so Android asset packaging cannot change its requested filename. Browser OCR retains the smaller gzip model.
- Added native-export transport and plain-language-model OCR regression checks; release packaging checks include the native bridge and language asset.

## 3.0.0

- Offline-first core with complete portable backups, conflict-previewed restore and full-content Search/Trash.
- Reviewed syllabus/reference imports, text PDFs, original-source retention and local printed-English photo/scanned-PDF OCR.
- Safer timetable proposals with matching, duplicate/conflict checks, sections and alternating weeks.
- Source-linked AI note drafts, preserved student edits/provenance, corrected math, local drafts and history.
- Editable flashcards, unambiguous choices, saved quizzes/mistakes and approved revision blocks.
- Timed study windows, exact-deadline checks, protected planning/catch-up and paused Focus recovery.
- Atomic application history, frozen CV snapshots, contact fields and anchored recurring bill categories/dates.
- Manual quality reviews, exact snapshots, stale-content detection and pilot reports.
- Offline usage guide, illustrated documentation and updated release/download links.
- Shared verification gate for Pages and stable-signed Android sideload releases, with checksums and source ZIP.

Real-course model quality and physical-phone installation/upgrade/alarm/memory acceptance remain manual checks. Optional AI needs your configured provider and internet; no public inference quota is bundled.
