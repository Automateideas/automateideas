# Security, isolation and regression review (Stage 15)

Reviewed: the whole Business Billing module (Stages 4–14) and how it touches the existing SaaS: sign-in, team, subscription and dashboard.

Status: every item in the master prompt's security list (section 25) and testing list (section 26) is met, or listed under [Open items](#open-items).

## Checklist (master prompt §25)

| Requirement | How it's met | Checked by |
|---|---|---|
| **Authentication** | Better Auth sessions. Every non-public API route requires a session. | Route guard test (every route file is checked); E2E "signed out → 401". |
| **Role-based access** | Business Billing permissions per role (`lib/roles.ts`). Owners and admins have all of them; members have none. | Each E2E suite checks a member gets 403 on that stage's APIs. |
| **Tenant isolation** | The company id comes only from the session, never the request. All queries run inside `withTenant`, which switches the connection to the `billing_tenant` role with the company set. Composite foreign keys mean a row can only point at its own company's rows. | DB test `rls.db.test.ts` checks all 45 tables; every suite has "another company sees nothing / gets 404". |
| **Backend authorization** | `requireBillingPermission` runs first in all 100+ Business Billing routes. Writes are blocked while a workspace is read-only. | Route guard test fails the build if a route lacks it. |
| **Database-level policies** | Row-level security (FORCE) on all 45 Business Billing tables. Triggers make issued documents, journal entries, stock movements and allocations permanent. The audit log is append-only by privilege. | DB tests try forbidden updates and deletes. A restore test confirmed 46 policies and 27 triggers survive backup and restore. |
| **Secure file uploads** | Images are checked by their bytes (magic numbers), not their name. Size is capped. Files are private in S3 and served by short-lived signed URLs. | Template and branding E2E (SVG refused, signed URLs). |
| **Encryption in transit** | HTTPS in production, with HSTS on every response (two years). | Security E2E checks the headers. |
| **Sensitive data** | Share-link tokens are stored only as SHA-256 hashes. Companies' WhatsApp tokens and PINs are AES-256-GCM encrypted (`APP_ENCRYPTION_KEY`). APIs never return tokens. Secrets are masked in the audit log. | Unit test (seal/open, tamper, wrong key); WhatsApp DB and E2E tests check that no token appears. |
| **Rate limiting** | Sign-up and login: Better Auth's limiter. Public share links: 60 per minute per IP. Outgoing email and WhatsApp: 300 per company per hour (database-counted). The shared WhatsApp number: a monthly cap per company. | Unit and DB tests; security E2E sees 429 on the 61st request. |
| **Webhook verification** | PayU: hash check. Meta WhatsApp: HMAC-SHA256 of the raw body with the app secret, compared in constant time, plus the verify-token handshake. Cron: bearer secret, compared in constant time; endpoints are off when it's not set. | WhatsApp E2E (bad signature → 401, wrong verify token → 403); cron E2E (no or wrong secret → 401). |
| **Audit logs** | Every successful Business Billing change: who, when, IP, browser, record, and request body with secrets masked. Append-only. Visible to owners and admins in Settings → Activity. | Audit DB tests; security E2E. |
| **Backups and recovery** | `scripts/backup-db.sh` (checked dump, rotation) and `docs/operations.md` (schedule, off-site copies, full and per-company restore). | A backup was restored into a fresh database and matched the original. |
| **Idempotency** | Payments, refunds, supplier payments, manual journals and stock adjustments take an Idempotency-Key. Scheduled reminders and recurring invoices are unique per stage or date. | Concurrency tests: a repeated key records once; two runs at the same moment act once. |
| **Never trust client totals or tenant ids** | Totals, taxes, numbers and balances are always recalculated on the server. Allocations are checked against what's still owed. The company id is never read from the request. | Document, payment and isolation tests (an `organizationId` sent in the body is ignored). |

## What this stage changed

1. **Security headers** (`next.config.ts`):
   - `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`;
   - `X-Content-Type-Options: nosniff`;
   - `Referrer-Policy: strict-origin-when-cross-origin`;
   - `Permissions-Policy`;
   - HSTS.
2. **Cross-site request check** (`lib/access.ts`, `route()`): a change (POST, PUT, PATCH or DELETE) carrying an Origin that isn't this app is refused with 403. This adds to SameSite cookies. Webhooks, PayU's return, share links and cron don't use `route()` and are unaffected.
3. **Audit trail** (`lib/audit.ts`):
   - Written from one place: `requireBillingPermission` names the actor, and `route()` records the change if it succeeds.
   - API: `GET /api/business-billing/audit-logs` (owners and admins).
   - Page: Billing → Settings → Activity.
4. **Rate limits**:
   - Public share links: `lib/rate-limit.ts`.
   - Hourly message cap: `communication/limits.ts`, applied to every email and WhatsApp send.
5. **Backups and recovery**: `scripts/backup-db.sh` and `docs/operations.md`; `/backups/` is ignored by git.
6. **Guard tests**:
   - every API route must be guarded or on a short reviewed public list (`routes.test.ts`);
   - security unit tests;
   - audit DB tests;
   - a security E2E suite.

## Reviewed, no change needed

- **Raw SQL:** every `sql.raw` uses fixed table or column names from the code, never input. All values are bound parameters.
- **HTML injection:** no `dangerouslySetInnerHTML`. Email templates escape every value (unit-tested).
- **Dependencies:** `pnpm audit --prod` reports 1 low and 1 moderate advisory, both in the `shadcn` CLI's own dependencies (`minimatch`, `deepmerge`). The app only imports a CSS file from that package at build time; that code never runs on the server.
- **Concurrency:**
  - 10 invoices issued at once get 10 consecutive numbers;
  - the plan's invoice cap, the last unit of stock, recurring runs and reminder runs each act exactly once under parallel requests.

## Tests at the end of this stage

| Suite | Result |
|---|---|
| Unit (`pnpm test`) | 302 / 302 |
| Database (`pnpm test:db`) | 174 / 174 |
| End-to-end against the production build | 14 suites, 592 checks, all passing: security 17, subscription and plans 37, WhatsApp 28, recurring 30, email and reminders 40, inventory 51, contacts and catalogue 62, tax and numbering 44, documents 53, payments 41, PDFs and templates (with storage) 33, purchases 50, accounting 58, reports 48 |
| Lint, typecheck, build | Clean (one `<img>` warning that predates the billing work) |

The first SaaS test scripts (Stages 2 and 3) are no longer valid as written. They check behaviour later stages replaced on purpose (`/api/billing` was renamed to `/api/subscription`; `/billing` became the billing module) and sign up users faster than the sign-up rate limit allows. The same areas (sign-up, login, team invites, subscription, company isolation) are covered by the current suites above.

## Open items

These are recommendations or earlier decisions, not failures:

1. **Database role in production.** Use a database user that owns the tables but is **not** a superuser. Row-level security relies on the switch to `billing_tenant`. A superuser bypasses it if any future code path forgets `withTenant`. The local Docker user is a superuser, which is fine for development.
2. **Rate limits across several servers.** The share-link limiter counts in memory per server. Move it to Valkey/Redis (`REDIS_URL` is already in the stack) before running more than one app server.
3. **Secrets in git history.** Earlier commits of `.env.example` contained real-looking keys. If those keys are still in use, rotate them; clearing the file doesn't remove them from history.
4. **Plan-based access** (e.g. "Advanced reports" on Starter) is deliberately not enforced yet. Decide after the SaaS work is complete.
5. **Logo upload** (`/api/organization/logo`, part of the existing SaaS settings) is still allowed while a workspace is read-only.
6. **Not yet verified against live services:** WhatsApp sends (tested against a fake Meta API), Resend email delivery (tested in log mode), and GST figures (follow the GST rules as implemented and tested, but not certified). Per the brief, no statutory compliance is claimed.
7. **No browser-based UI tests.** Pages are checked to render (HTTP 200), but no one has clicked through them in a browser for layout and usability.
8. **Deferred features:** e-invoicing (IRN), stock value in the balance sheet (books treat purchases as expenses), and a separate item editor for recurring invoices.
