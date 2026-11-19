# Optional AI setup

No AI key is required for courses, notes, mathematical rendering, local English OCR, cards, quizzes, deterministic Coach, planning, career/life tools or backups. AI is an explicit optional connection.

## ChatGPT plan on Windows

Use [the included Windows local connector](CHATGPT_CONNECTION.md). It opens an interactive account sign-in and keeps credentials in protected local storage. Text tutoring and source-linked notes run in its loopback app window. The hosted site and Android APK do not directly consume your ChatGPT plan. No copied cookies or pasted session tokens are needed.

## Gemini or Groq through your backend

The included Node server supports Gemini for text/notes/image extraction and Groq as an alternative for text/notes. Current account models, free tiers, usage limits and availability depend on the provider; verify them in your account. No inference quota is included with this repository.

Check the official [Gemini pricing/free-tier table](https://ai.google.dev/gemini-api/docs/pricing) and [Groq rate limits](https://console.groq.com/docs/rate-limits) before choosing a model. These are live references rather than fixed quota promises.

1. Create a provider account/key using [Google AI Studio](https://aistudio.google.com/apikey) or [Groq Console](https://console.groq.com/keys). Use each provider's official key instructions. Keep keys in a password manager and never share them in chat/issues.
2. Install server dependencies with `npm ci --prefix server`.
3. Copy `server/.env.example` to `server/.env` locally. Fill only the provider(s) you intend to use.
4. Run `npm start --prefix server`. The default local host is `127.0.0.1:3001`; Vite development/preview proxy `/api` to it.
5. Check `/api/health`. Provider flags show configuration/readiness; they do not prove real-model access or available quota.
6. In Tutor or AI notes, explicitly select the desired available provider. Review source excerpts before sending and compare outputs with your material.

| Server setting | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Gemini credential, server only |
| `GEMINI_MODEL` | Account-supported model; the checked-in default is an overrideable alias |
| `GROQ_API_KEY` | Optional alternative text-provider credential, server only |
| `GROQ_MODEL` | Account-supported text model override |
| `HOST`, `PORT` | Local binding defaults to 127.0.0.1:3001; a host may require 0.0.0.0 |
| `ALLOWED_ORIGINS` | Exact permitted website/Android/development origins, without paths |
| `TRUST_PROXY_HOPS` | Match the reverse-proxy chain; do not trust arbitrary forwarded headers |

## Connect a hosted website or APK

Deploy `server/` to an HTTPS Node 22.13+ service. Use install `npm ci`, start `npm start`, health `/api/health`, and configure provider keys in the host's private environment. The optional `render.yaml` is a starting point, not an already provisioned service or a guarantee of free hosting.

Set `ALLOWED_ORIGINS` to `https://playxgaming.github.io,https://localhost` for the website/Android, plus only needed development origins. Set host binding and proxy hops for your host.

For a single device, open **Settings → AI connection**, enter the backend's HTTPS origin without `/api`, and choose **Save & test connection**. This stores a public URL, not a key.

To bundle the URL, set repository Actions variable `VITE_AI_API_URL` and run **Verify and release** on `main`. Reopen the website and install the new APK after backing up. Never put any API credential in a `VITE_` variable.

## Verify without surprises

Try a non-private Tutor question, a small source-linked note, and—only with image-capable Gemini configured—a synthetic timetable image. Check citations, equations, context, costs/quotas and save/reload. Mocked regression tests establish app wiring, not factual accuracy or account access. Use Quality reviews for real-course evidence.

Switching provider is an explicit choice; private context is not automatically retried on another provider. Quota/model/network failures leave local tools usable.

Keep an owner-funded endpoint restricted to a controlled pilot until you implement authentication, durable per-user quotas and spending controls. CORS/rate limits alone do not establish user access control. See [deployment](DEPLOYMENT.md) and [security](SECURITY.md).
