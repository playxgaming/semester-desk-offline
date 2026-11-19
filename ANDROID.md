# Android installation and builds

[Download the latest signed APK](https://github.com/playxgaming/semester-desk-offline/releases/latest/download/semester-desk.apk) · [Release evidence](https://github.com/playxgaming/semester-desk-offline/releases/latest) · [Full usage guide](docs/USER_GUIDE.md)

## Install

1. Export a complete JSON backup from any existing installation first.
2. Download `semester-desk.apk` from this repository's latest release.
3. Open it on Android and allow installation from your browser/file manager when prompted.
4. Launch Semester Desk. The academic tools, local data and English OCR assets are bundled and work offline. AI needs a separately configured provider and internet.

This is a **release-signed sideload APK**, not a Play Store listing. It uses package `app.semesterdesk`, versionName from package.json and an increasing versionCode. A stable private signer lets later releases update it normally. An old debug APK has a different signer: back up first, uninstall only if Android requires it, install this release, then import and check the backup. Uninstalling deletes local app data.

The website, Windows connector and Android have separate storage. Migrating from the old hosted project also requires a complete backup. Keep the source copy until you verify records and original files on the destination.

## What release verification proves

The shared GitHub workflow verifies the app, deploys Pages and builds the APK from the exact verified web assets. It checks the APK signature with `apksigner`, package/version metadata with `aapt`, bundled app/OCR assets and SHA-256 checksums. Releases include the APK, complete source ZIP, checksum manifest and public signature/package evidence.

This does not prove installation, upgrades, notification delivery or low-memory OCR on a physical device. Use [manual phone acceptance](PILOT_ACCEPTANCE.md#android-later). Native reminders need notification permission, device alarm settings and regular app opening to refresh the schedule. Browser scheduled reminders require the app to be open.

## Build locally

Install Node.js 22.13+, **JDK 17**, Android SDK platform 34 and build tools 34.0.0. Keep `JAVA_HOME` on JDK 17; the Gradle 8.2.1 wrapper is incompatible with JDK 24. No signing key belongs in the repository.

```bash
npm ci
npm run android:apk        # local debug build, for development only
npm run android:release    # signed build, requires private environment below
```

Signed release environment:

| Variable | Value |
| --- | --- |
| `SD_KEYSTORE_PATH` | Absolute path to your private keystore |
| `SD_STORE_PASSWORD` | Keystore password |
| `SD_KEY_PASSWORD` | Signing-key password |
| `SD_KEY_ALIAS` | Release-key alias |
| `SD_VERSION_CODE` | Optional explicit increasing integer; default 3,000,000 plus CI run number |
| `SD_VERSION_NAME` | Optional override; default package.json version |

The release builder refuses missing signing material. Output: `android/app/build/outputs/apk/release/app-release.apk`. Debug output: `android/app/build/outputs/apk/debug/app-debug.apk`.

## CI signing and key recovery

Repository Actions secrets hold `SD_KEYSTORE_BASE64`, `SD_STORE_PASSWORD`, `SD_KEY_PASSWORD` and `SD_KEY_ALIAS`. Only the verified `main` release job receives them; pull-request verification does not. The workflow restores the keystore into its temporary directory and removes it when assembly ends. Passwords are not source files, frontend variables or release assets.

The initial release setup stores the private key and its private settings in the owner's protected `SemesterDeskSigning` folder outside this checkout. **Back up both securely**, for example in encrypted offline storage/password-manager attachments. Never upload that folder or paste its contents into an issue/chat. Losing this key prevents ordinary updates to its existing installations.

## Verify a download

Compare the APK's SHA-256 with `SHA256SUMS.txt` in the same release. Windows:

```powershell
Get-FileHash -Algorithm SHA256 .\semester-desk.apk
```

Checksums detect download corruption; signing evidence establishes the release certificate. See [Android's signing guide](https://developer.android.com/studio/publish/app-signing) and [apksigner verification](https://developer.android.com/tools/apksigner).
