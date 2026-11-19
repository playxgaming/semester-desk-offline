# Website, signed app and rollback

- Repository: [playxgaming/semester-desk-offline](https://github.com/playxgaming/semester-desk-offline)
- Website: [Semester Desk](https://playxgaming.github.io/semester-desk-offline/)
- Android: [latest signed release](https://github.com/playxgaming/semester-desk-offline/releases/latest)

## Release pipeline

**Verify and release** runs for `main` pushes and manual dispatch; pull requests run verification without deployment/signing secrets. It installs locked dependencies, runs the complete release verification and production dependency audits, then stages the exact verified web assets.

Only after verification succeeds can GitHub Pages deploy or Android build/sign. Pages uses the repository's **GitHub Actions** build source. Relative asset paths, hash routing and the PWA manifest support the `/semester-desk-offline/` project path.

Android receives the verified web artifact, syncs Capacitor with the checked-in JDK 17/SDK 34 toolchain, assembles/signs, verifies signature/package/assets and publishes `v<version>-build.<run>` releases. The version code increases per run. APK, source ZIP, public verification output and checksums are attached. See [ANDROID.md](ANDROID.md).

## First-time repository settings

1. Enable Pages with build type **workflow** / **GitHub Actions**.
2. Configure the four encrypted signing secrets described in ANDROID.md.
3. Leave `VITE_AI_API_URL` unset for the fully local core. If bundling a backend address, set this repository variable to its HTTPS origin, never an API key.
4. Push the verified source to `main`; wait for verification, website deployment and Android publishing.
5. Open the actual hosted URL, test offline loading in a fresh profile and check all published downloads.

The setup follows [GitHub Pages' workflow deployment](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). No server, database or paid provider is needed for the static core.

## Optional backend

GitHub Pages cannot run Node or hold provider secrets. Deploy `server/` to a Node 22.13+ HTTPS service if you need Gemini/Groq. The optional Render blueprint is included; review the host's current plans/quotas before provisioning. See [AI_SETUP.md](AI_SETUP.md).

Use `ALLOWED_ORIGINS=https://playxgaming.github.io,https://localhost` for this website and Capacitor Android, plus only the actual local development origins needed. Origins do not include repository paths. Host binding/proxy hops must match your provider.

An in-memory pilot rate limit is not public multi-user authentication. Before exposing an owner-funded key to unrestricted traffic, implement authenticated users, durable per-user quotas and spending controls. The release does not silently create such a public AI service.

## Update safely

Back up local student data first. Bump package.json/package-lock.json for a versioned change, run verification and push. Reopening the website online updates cached app assets; keep old backups until the new version and database are verified. Signed Android updates must retain the private signer and increase versionCode.

## Rollback and recovery

Keep release source ZIPs, commit hashes and complete student backups. For a code regression, revert the code in a new commit, preserving backward-compatible database reads, then run the release workflow. Android rollback is a new higher version code signed with the same key; do not ask users to downgrade their database or install an older lower version code.

Database v6 adds a table while retaining earlier records. Do not roll an already-upgraded database back by deleting stores. If compatibility cannot be maintained, recover student data into a fresh profile from a verified complete backup. Never clear live browser storage as a routine deployment step.

If CI fails, inspect its failing group and archived logs. Fix and rerun verification before publishing. Keep the previous successful website/release usable until a replacement passes.
