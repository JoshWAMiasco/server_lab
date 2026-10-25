# 08 — Authentication

Model: **one local admin**. Tailscale limits who can reach the app, and this password limits who can use it.

## First run: `/setup`
- If the `admin` table is empty, every route redirects to `/setup`.
- The form asks for a password and confirmation. Minimum 12 characters, checked with zod. A zxcvbn-style strength meter is optional.
- **Setup token:** to stop someone else on the tailnet from claiming the instance first, `/setup` also needs a one-time token that `install.sh` prints to the console and saves to `/var/lib/serverlab/setup-token` (mode 600). The token is deleted after setup.
- Once the admin exists, `/setup` returns 404.

## Passwords
- argon2id via `@node-rs/argon2` (memory 64 MiB, t=3, p=1).
- Settings has "Change password" (current password required); changing it revokes all other sessions.
- **Reset if forgotten:** run the CLI `sudo -u serverlab npx serverlab reset-password` on the host.

## Sessions
- Token: 32 random bytes, base64url. Only `sha256(token)` is stored in `sessions`.
- Cookie `sl_session`: `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7d`, sliding (extended when used within 1 day of expiry).
- Settings shows active sessions (IP, UA, last seen) with a revoke button.

## Guard
- **`proxy.ts`** (Next 16's replacement for `middleware.ts`):
  - It checks only that the cookie is **present** (cheap) and redirects to `/login?next=…` if it is missing.
  - It skips `/login`, `/setup`, `/_next/*`, `/favicon*`, fonts and icons.
- **Real validation** happens on the server in `lib/auth/require-session.ts`, which is called from:
  - the `(dashboard)/layout.tsx` server component
  - every server action
  - `/api/stream`
- The proxy is not a security boundary on its own. The server-side checks are.

## Brute force protection
- `login_throttle` per IP: 5 failures in 15 minutes leads to a 15-minute lockout, and the lockout doubles each time up to 24 h.
- Every attempt (success and failure) goes into `login_events` with `channel='web'`, so it shows in the User Watcher and can trigger alerts.

## CSRF
Server actions are POST-only, and Next checks Origin. Together with `SameSite=Strict` this is enough. The SSE route is GET and read-only.

## Acceptance criteria
- An unauthenticated request to `/resources` redirects to `/login`. A request to `/api/stream` returns 401.
- The 6th wrong password within 15 minutes gets "locked, try again in 15:00".
- Deleting the session row logs the browser out on its next navigation.
- The DB never contains a plaintext token or password.
