# Operations: backups, recovery and keeping it secure

## Backups

**Database** (customers, invoices, payments, books, everything):

```
scripts/backup-db.sh                              # local docker compose database
DATABASE_URL=postgres://… scripts/backup-db.sh    # production
```

- **What it does:** writes `backups/<UTC time>.dump` (compressed `pg_dump` custom format), checks that the file can be read back, and keeps the newest 14 (`KEEP=30` to keep more).
- **Schedule:** run it daily from cron (e.g. 02:00 IST). If your database is a managed service (AWS RDS, Neon, Supabase, DigitalOcean), also turn on its automatic backups with point-in-time recovery: that covers the hours between daily dumps.
- **Copy each dump off the server,** for example to a separate private bucket, in another region if possible. Never store it in the public files bucket.
- **Test a restore** every month (below). A backup you haven't restored isn't proven.

**Files** (logos, signatures, stamps, PDF copies) live in the S3/R2 bucket:
- Turn on **versioning** for the bucket so overwritten or deleted files can be recovered.
- Optionally replicate it to a second bucket.
- PDFs of issued documents can always be regenerated from the database, so the bucket matters mostly for uploaded images.

## Recovery

**Restoring the whole database** to a fresh, empty database:

```
createdb hrms_restore
pg_restore --no-owner --dbname=postgres://…/hrms_restore backups/<file>.dump
```

Then point `DATABASE_URL` at it, run `pnpm db:migrate` (it does nothing if the dump is current), start the app and check a few invoices and the trial balance before switching users over.

**Restoring one company's data** without touching the others: restore into a separate database as above, then copy that company's rows across, filtering by `organization_id`. Every Business Billing table has it. Do this with care, inside a transaction. The financial records (issued documents, payments, journal entries, stock movements) are protected by database triggers, so copy them into empty tables, not over existing rows.

**Local development database:** `docker compose down` keeps the data. Only `docker compose down -v` deletes the volumes.

## Secrets (`.env`)

| Secret | If it leaks |
|---|---|
| `BETTER_AUTH_SECRET` | Rotate it. Everyone is signed out once. |
| `RESEND_API_KEY`, `GOOGLE_CLIENT_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `META_APP_SECRET`, `PAYU_SALT`, storage keys | Revoke and create new ones at the provider, then update `.env`. |
| `APP_ENCRYPTION_KEY` | Encrypts companies' WhatsApp tokens. If it changes, companies must reconnect their WhatsApp numbers. Back it up separately from the database. |
| `CRON_SECRET` | Change it here and in the scheduler. |

- **Keep `.env` out of git.** `.env.example` must contain placeholders only.
- **Never put secrets in issue trackers, chats or screenshots.**

## Security settings in production

- **Serve only over HTTPS.** The app sends HSTS, and browsers then refuse plain HTTP.
- **`BETTER_AUTH_URL` must be the public `https://` address.** Requests that change data from any other website are refused. If the app has more than one public address, list the extras in `TRUSTED_ORIGINS` (comma-separated).
- **Behind a proxy or load balancer,** make sure it passes `X-Forwarded-For` (for rate limits and the activity log) and `X-Forwarded-Host`.
- **Database:**
  - Use a database user that owns the tables.
  - The app switches to the limited `billing_tenant` role for each company's data, so row-level security applies.
  - Don't run `drizzle-kit push` against production. Use `pnpm db:migrate`; migrations also create the security policies.
- **Rate limits:**
  - Public share links: 60 requests per minute per IP. This is counted in memory, so with several app servers each counts separately. Move it to Valkey/Redis if you scale out.
  - Outgoing emails and WhatsApps: 300 per company per hour (`BILLING_MESSAGES_PER_HOUR`). This is counted in the database.

## Monitoring

**Watch these:**
- The scheduled job's response (`/api/cron/billing`): `failed` counts above 0.
- HTTP 5xx rates.
- Database disk space.
- The size of the backup directory.

**Activity log:** Billing → Settings → Activity shows every change, who made it and from which IP. Entries can't be edited or deleted.
