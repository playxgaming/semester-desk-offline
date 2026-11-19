# Pitch data and source register

Prepared November 19, 2026. Created by Sarvesh Sehra.

## External context

**Slide 2 — nearly 4.33 crore students in Indian higher education, AISHE 2021–22.** [Ministry of Education / Press Information Bureau, January 25, 2024](https://www.pib.gov.in/PressReleasePage.aspx?PRID=1999713&lang=2&reg=3). This is an explicitly dated, final-survey baseline. It is not a claim about the latest enrolment, our app users, paying customers or addressable revenue. The scattered-workflow description is a product hypothesis, not a survey result.

## Product and verification evidence

The deck describes the [v3.0.2-build.8 release](https://github.com/playxgaming/semester-desk-offline/releases/tag/v3.0.2-build.8), [source baseline c06b7b0](https://github.com/playxgaming/semester-desk-offline/tree/c06b7b0e78be2736210cd154d582d0dc85bec508) and [verified release workflow](https://github.com/playxgaming/semester-desk-offline/actions/runs/44486669139). Subsequent documentation builds can produce a newer APK under the stable latest-download URL.

| Slide | Value | Meaning / evidence |
| --- | --- | --- |
| 12 | 40 | Passing release verification **groups**, not individual assertion count. See the release's `release-verification.json` and CI verify logs. |
| 12 | 20 | Main routes in responsive browser audits at 360 and 390px. See `docs/TESTING.md` and route verification scripts. |
| 12 | 11.23 MiB | v3.0.2-build.8 APK asset: **11,775,104 bytes / 1,048,576**. This is download size, not installed size. |
| 12 | Hosted offline + OCR checks | Release assets `hosted-results.json` and `hosted-ocr-verification.json`. Checks used synthetic content and a scanned English PDF. |
| 13 | 21,513.75 KiB → 13,892.92 KiB | Offline precache payload reported by the Vite PWA build before and after switching to the portable OCR core on November 19, 2026. The final payload is reproducible from the baseline production build. The before value is a development build-log measurement; it is not a user benchmark. |
| 13 | 21.0 → 13.6 MiB; 35.4% | KiB / 1024. Relative reduction: `(21513.75 - 13892.92) / 21513.75 × 100`. This is cache payload, not APK size, speed, memory consumption or improved learning. |

Release evidence assets are downloadable from the linked tagged release. Product capability descriptions can be checked against the [illustrated user guide](../USER_GUIDE.md), [architecture](../ARCHITECTURE.md) and [testing notes](../TESTING.md).

## Images, QR codes and limits

Screenshots are actual Semester Desk screens from a disposable demo profile; [capture manifest](../images/screenshots.json). They do not show real student records, measured adoption or live AI output. No external stock images or generated mock app screens are used.

QR images have a white four-module quiet zone and encode [these exact URLs](../images/qr/destinations.json). Their generated images and final rendered QR slide were decoded to verify the destinations. Embedded QR images are also clickable links in the PPTX.

The proposed pilot is not launched traction. No user count, revenue, grade improvement, time saved or measured AI factual accuracy is claimed. Browser automation does not replace physical Android installation/upgrade, alarm, file-picker, printing or low-memory testing. AI source linkage and manual quality reviews are not truth certification.
