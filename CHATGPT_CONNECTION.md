# ChatGPT connection: local Windows preview

This adds text Tutor and source-linked AI notes through OpenAI's official
Sign in with ChatGPT flow. It does not reuse Codex credentials, require an API key,
or collect your ChatGPT password. Account eligibility and consent are checked by
OpenAI. A successful build is not proof that an account has granted plan usage.

## Current scope

The official DevKit is intended for a local Node process running on the user's
machine. This implementation is a Windows local app at
`http://127.0.0.1:4768`, separate from the public website and the Android APK.
It does not deploy subscription tokens to Render or enable a shared public proxy.
Hosted/mobile integration must use a supported registration/eligibility path.

Sources checked 16 November 2026:

- [Quickstart](https://developers.openai.com/siwc/quickstart)
- [Local/open-source scope](https://developers.openai.com/siwc/token-sharing-open-source)
- [Credential handling](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/docs/security.md)
- [Required inference contract](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)

## Start and connect

Requirements: Windows, Git, Node 22.13+ (Node 24 also works in local tests), an
eligible ChatGPT account (the guide currently lists eligible Plus/Pro accounts),
and internet access for authorization and answers.

```powershell
npm.cmd ci
npm.cmd run chatgpt:setup
npm.cmd run build
npm.cmd run chatgpt:start
```

1. Keep the terminal running. Open
   [local Settings](http://127.0.0.1:4768/#/settings).
2. The separate local origin has its own app data. On first launch, finish or
   skip the setup wizard. Your existing website/APK records are unchanged.
   Transfer your semester using a complete backup if desired.
3. In **Connect ChatGPT**, choose **Continue with ChatGPT**.
4. Complete login, account/workspace selection and plan-usage consent in the
   official OpenAI browser window. Never paste authorization codes/tokens in chat.
5. The app reports **Using ChatGPT plan** only after the required permission is
   granted. Dismiss the first-use explanation with **Got it**.
6. Select an account-listed model, then open Tutor and choose **ChatGPT**.
7. Send a question to verify real inference. Health/status alone does not verify
   account allowance, model access or answer quality.

Use **Manage usage** to review app limits in ChatGPT settings. Use **Disconnect
ChatGPT** to remove local credentials and attempt remote revocation. If the app
cannot confirm remote disconnection, remove access in ChatGPT settings too.

## What gets sent

Only the question, subject/level, selected course label and up to six prior Tutor
question/answer pairs are sent for a text answer. Grades, attendance, note files
and your other ChatGPT conversations/memory are not automatically accessed.
Recent Tutor context is visible in the app before sending. Switching from another
provider to ChatGPT sends that conversation context to ChatGPT; it is an explicit
choice, never an automatic retry/fallback.

The official SDK discovers models for the selected account, refreshes OAuth
credentials, verifies identity, and consumes streamed Responses through the
completion event. It uses `store:false`, `stream:true` and supported text context;
it does not use private ChatGPT backend endpoints or unsupported sampling fields.
No inference is performed merely by signing in or listing account models.

## Storage and trust boundary

- OAuth tokens stay in the local Node process and SDK encrypted files under
  `%USERPROFILE%\AppData\Local\SemesterDesk\ChatGPT`.
- Windows DPAPI encrypts data for the current OS user; there is no plaintext or
  hardcoded-key fallback. A synthetic startup round-trip checks availability.
- The browser receives a whitelisted connection status and account labels, never
  OAuth access/refresh/ID tokens. Its per-launch CSRF value is request protection,
  not an OpenAI credential. Model choice is non-secret local UI preference.
- The HTTP listener binds only `127.0.0.1:4768`, checks Host/Origin/Fetch Metadata,
  and requires same-origin JSON + a per-launch CSRF header for mutations/inference.
- The local app is served by the bridge. It does not expose CORS access to the
  GitHub Pages site or another website. Do not tunnel this port to the internet.
- A process already running as the same trusted Windows user remains inside the
  OS trust boundary; DPAPI does not protect against a compromised local account.
- The connector disables its service-worker route and serves uncached files so a
  stale cached renderer cannot replace this local bridge's current UI.
- Exported semester backups do not include ChatGPT credentials. Disconnect is
  independent from resetting course data.

## SDK provenance and license

`npm run chatgpt:setup` downloads the official repository to the ignored directory
`tools/chatgpt-devkit-source`, checks out revision
`0a36fefeb913055c8c7a1a29b63d82b96b2e841a`, installs its locked local-SDK workspace
dependencies with lifecycle scripts disabled, then builds the local SDK and copies
its license/third-party notices. Root app dependencies do not include the SDK in
the browser bundle. The source is unmodified.

The DevKit uses its own **Noncommercial License v1.0**, not an assumed MIT license.
Keep its notices. This preview targets the user's stated personal/student pilot;
commercial use/distribution needs review of those terms and the applicable
OpenAI registration options. [Official DevKit](https://github.com/openai/sign-in-with-chatgpt-devkit).

## Verification

`npm run chatgpt:test` checks local boundary rejection, CSRF, credential-field
filtering, sign-in/cancel/disconnect, account-listed model selection and Windows
OS encryption using synthetic data. Browser integration tests use a fake SDK and
never sign in or send a real question. The production build checks frontend types.

Live authorization is a user step. No successful real account connection or model
answer should be claimed until the user completes consent and tests a question.

## Recovery

- **Account/plan ineligible:** use an eligible account or keep existing API-based
  providers in the normal app. Do not route around an eligibility response.
- **Plan use not granted:** choose Continue with ChatGPT to request that permission;
  identity-only login is insufficient for inference.
- **Quota reached:** Manage usage; preserve the question and retry when appropriate.
- **Port busy:** close the other connector instance. Keep the documented port so
  browser origin and local data remain stable.
- **Encrypted file cannot be read:** restore access to the original Windows user
  and its DPAPI state. Do not delete saved credentials as an automatic recovery.
- **Browser window closed/cancelled:** cancel locally and try again. The SDK keeps
  an issued registration when possible so subsequent sign-in can reuse it.
