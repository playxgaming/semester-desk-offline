# Contributing

Use Node.js 22.13+, install root/server dependencies and run `npm run verify`. Read [architecture](docs/ARCHITECTURE.md) and [testing](docs/TESTING.md).

- Preserve offline core use, drafts/history and existing data through migrations.
- Use typed local mutations and transactions for related writes.
- Include new fields/entities in backup validation and restore checks.
- Review imported/model-proposed content before student records change.
- Keep controls responsive and accessible, with useful loading/error states.
- Test in disposable profiles with synthetic fixtures; never spend user AI quota automatically.
- Keep secrets, real documents, sign-in material and signing credentials out of commits/issues/screenshots.

Describe the concrete before/after behaviour, tests and remaining limits in your pull request. Bug reports need version, steps and a minimal synthetic example.
