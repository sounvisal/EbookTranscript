# Uploads, background jobs, and media storage

Use Node 22 and install from the lockfile. Run `npm run lint` separately from `npm run build`.

## November 15 rollout repair

The initial Next 16 update assumed the database migrations had already run. On the old schema, history reads joined the missing `TranscriptionJob` table and large uploads failed when creating a background job. The history page also displayed an empty state after a failed fetch.

The repair reads and saves history using the existing columns. It uses job links and scoped cache fields only when present. If the job schema is missing, new direct uploads use the existing streaming endpoint with the same signed upload token. Files still upload directly to Google. Keep the tab open for this temporary fallback; reconnectable background processing requires the migrations. Database outages and ambiguous job-start failures do not trigger fallback, avoiding duplicate processing.

Before republishing, run `npm run build`, `npm run test:rollout`, and `npm run lint -- --quiet`. The rollout test uses a disposable local PostgreSQL database and a simulated Gemini provider. It checks history and transcription on the old schema, applies migrations, checks preservation of existing transcripts, and verifies durable jobs on the new schema. It never uses the production database or sends notifications.

Run `npm run db:check` against the intended deployment database before enabling background jobs. This is read-only and fails if required columns are missing. A passing application build does not verify or migrate a database. Do not run `prisma migrate reset` or `prisma db push --accept-data-loss` to resolve a production mismatch.

## Database rollout

For an empty database, run `npx prisma migrate deploy`. An existing database previously managed without migration history must be baselined first. After checking that its schema matches the baseline migration and taking a backup, record the baseline with `npx prisma migrate resolve --applied 20261115000000_baseline`, then run `npx prisma migrate deploy`. Apply the migrations before rolling out this app version.

The account-isolation migration clears the previous shared cache because those entries have no recorded owner. Saved transcript history is preserved. Cache entries stop serving after seven days, and subsequent cache writes remove expired entries.

## Vercel preview checks

- Set `NEXTAUTH_SECRET` and either `GEMINI_API_KEY` or `GEMINI_API_KEYS`. Set `GEMINI_MODELS` to override the default model list. The app requires configured Gemini credentials for real requests.
- Test a short file, then a long recording and an upload above the inline limit. Refresh during a background job and reconnect from **Recent jobs**. Verify that completion creates one history record and one usage entry.
- Set `TRANSCRIPTION_QUEUE_ENABLED=true` to use the Vercel Queues consumer in the preview deployment and repeat the recovery check. Without that setting the app runs jobs after the response and interrupted jobs can be restarted from **Recent jobs**.
- Verify signed-in playback and deletion using two accounts and same-name files in the same browser. Existing local audio stored under the exact transcript ID is migrated when accessed. Older filename-only copies are removed because they cannot be attributed safely.
- API clients generating summaries can request a session at `POST /api/upload-session` with `purpose: "report"`, upload to the returned URL, and send `{ "mode": "summary", "uploadToken": "…" }` to `POST /api/report`. Files up to 4 MB can still be posted as multipart.
