# Security and local data

Student records/files stay on-device. Optional AI sends only explicitly selected requests/context. Protect the device/browser profile and save complete backups outside browser storage.

Never put provider credentials in `VITE_` variables, frontend source, URLs, issues or screenshots. Backend keys stay in the server environment. ChatGPT sign-in material belongs only in the connector's private storage; copied session cookies are unsupported.

The stable release signer is private. GitHub Actions holds encrypted signing secrets. Only its public certificate/fingerprint and APK verification output are published. Securely back up the private local signing folder: losing the key prevents normal updates to existing installations.

Use **Security → Report a vulnerability** when enabled. Otherwise open a minimal issue asking for a private reporting channel without exploit details, credentials or personal data. Unrestricted shared paid AI hosting requires authentication and durable quota controls.
