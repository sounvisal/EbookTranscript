# Uploads, background jobs, and media storage

Use Node 22 and install from the lockfile. Run `npm run lint` separately from `npm run build`.

## Database rollout

For an empty database, run `npx prisma migrate deploy`. An existing database previously managed without migration history must be baselined first. After checking that its schema matches the baseline migration and taking a backup, record the baseline with `npx prisma migrate resolve --applied 20261115000000_baseline`, then run `npx prisma migrate deploy`. Apply the migrations before rolling out this app version.

The account-isolation migration clears the previous shared cache because those entries have no recorded owner. Saved transcript history is preserved. Cache entries stop serving after seven days, and subsequent cache writes remove expired entries.

## Vercel preview checks

- Set `NEXTAUTH_SECRET` and either `GEMINI_API_KEY` or `GEMINI_API_KEYS`. Set `GEMINI_MODELS` to override the default model list. The app requires configured Gemini credentials for real requests.
- Test a short file, then a long recording and an upload above the inline limit. Refresh during a background job and reconnect from **Recent jobs**. Verify that completion creates one history record and one usage entry.
- Set `TRANSCRIPTION_QUEUE_ENABLED=true` to use the Vercel Queues consumer in the preview deployment and repeat the recovery check. Without that setting the app runs jobs after the response and interrupted jobs can be restarted from **Recent jobs**.
- Verify signed-in playback and deletion using two accounts and same-name files in the same browser. Existing local audio stored under the exact transcript ID is migrated when accessed. Older filename-only copies are removed because they cannot be attributed safely.
- API clients generating summaries can request a session at `POST /api/upload-session` with `purpose: "report"`, upload to the returned URL, and send `{ "mode": "summary", "uploadToken": "…" }` to `POST /api/report`. Files up to 4 MB can still be posted as multipart.
