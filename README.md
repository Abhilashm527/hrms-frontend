# hrms-frontend

Web app for the Ivoyant HRMS. The API lives in the `hrms` repository (deployed at https://hrms-api-haqa.onrender.com).

React 19 + TypeScript + Vite, React Router, TanStack Query, and the Ivoyant design-system CSS (`src/styles/ds`, copied from the UX bundle).

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173, /api/* is proxied to the API
```

Set `HRMS_API_URL` in `.env.local` to point the proxy at another API (for example `http://localhost:8081`).

## What's built

- **Sign-in** (`/login`): email + password, "keep me signed in", forgot password, Microsoft button when the API has SSO on.
- **Two-step verification**: code entry (or a recovery code) and first-time **setup** (QR code / key → confirm → recovery codes).
- **Emailed links**: `/#reset?token=…` and `/#activate?token=…` from the API become `/reset-password` and `/activate`; the token is removed from the address bar on load.
- **App shell + dashboard** from the UX: header, collapsible sidebar (admin or self-service menu from `/auth/me`), theme (auto/light/dark), My account (two-step status, active sessions, sign out other devices).

## Onboarding

- **`/onboarding`** (HR): pipeline tiles, filters (kept in the URL), table, and **New hire** — a wizard built from the API's `/onboarding/hire-form` steps (Personal, Job, Microsoft 365, Invite with document picker and live email preview).
- **`/onboarding/:id`**: hire page with stage tracker; create the work account, send/resend the invite, verify or reject documents, checklist, activity, **Mark as joined** (or join early with a reason), cancel.
- **`/portal?token=…`**: the new hire's page from the invite email — fill in details, upload documents (PDF/JPG/PNG, 6 MB), submit for review. Links to `/onboarding?token=…` (the API's default portal URL) are sent here.
- Microsoft 365 is simulated by the API until a real Graph client exists; the hire page says so.

On the API set `HRMS_ONBOARDING_PORTAL_URL` to `<this site>/portal` (or leave the default path `/onboarding`, which also works).

## Session handling

| Concern | How |
| --- | --- |
| Access token | Memory only (`src/lib/session.ts`), never in localStorage/sessionStorage. 15-minute JWT sent as `Authorization: Bearer`. |
| Refresh token | httpOnly, SameSite=Strict cookie set by the API on `/api/v1/auth`; script never touches it. |
| Silent refresh | Timer refreshes 1 min before expiry; a 401 refreshes once and retries; returning to a stale tab refreshes. |
| Page reload / new tab | Session restored from the cookie via `POST /auth/refresh`. |
| Several tabs | Refresh tokens rotate and reuse ends the session, so tabs take a Web Lock before refreshing and share the new token over a BroadcastChannel. Sign-in/out in one tab applies to all. |
| Server cache | TanStack Query, in memory only, 30 s fresh; wiped on sign-out so the next user sees nothing. API calls use `cache: 'no-store'`. |
| Redirects | Protected routes send you to `/login?returnTo=…`; only same-app paths are accepted as `returnTo`. |
| Stored in localStorage | Theme, sidebar state, last email (if "keep me signed in"), and a signed-in flag. No tokens or personal data. |

## Deploy on Render

`render.yaml` builds with `npm ci && npm run build`, publishes `dist`, rewrites `/api/*` to the API, and sets cache and security headers (CSP, frame denial, etc.).

On the API service set `APP_BASE_URL` to this site's address (e.g. `https://hrms-web.onrender.com`, no trailing slash): refresh and sign-out are refused from any other origin, and emailed links point there.

If you edit the inline theme script in `index.html`, update its `sha256-…` hash in the CSP in `render.yaml`.
