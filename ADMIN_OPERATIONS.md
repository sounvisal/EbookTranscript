# Admin operations

The admin dashboard now includes Jobs and Settings, with desktop sidebar navigation and a mobile section selector.

## Telegram setup

Keep the existing bot token and notification chat configuration. Set `TELEGRAM_WEBHOOK_SECRET` for authenticated webhook requests. For an admin group, set `TELEGRAM_ADMIN_USER_IDS` to the comma-separated **individual user IDs** allowed to operate the service. Group membership alone never grants command access. Existing positive private-chat IDs in `TELEGRAM_CHAT_ID` or `ADMIN_CHAT_IDS` also authorize that individual.

After deployment, use the dashboard’s Telegram webhook registration action to refresh the command menu. No production registration or Telegram messages are sent by the local test suite.

| Command | Behavior |
| --- | --- |
| `/ops` | Open interactive model, Safe Mode, quota reset, and queue controls. |
| `/model 2.5-flash` | Pin new transcription work to Gemini 2.5 Flash. |
| `/model 2.5-flash-lite` | Pin new transcription work to Gemini 2.5 Flash Lite. |
| `/model auto` | Restore configured adaptive routing/fallback. |
| `/safe_mode on` | Pause new transcription starts, including Telegram media. Accepted background jobs can finish. History remains readable. |
| `/safe_mode off` | Accept new transcription work again. |
| `/reset_quota user@email.com` | Reset today’s transcription usage using the app’s UTC+7 quota day. Existing transcripts remain intact. |
| `/queue` | Show processing, queued, interrupted, and unexpired failed background jobs. |

Model pinning disables cross-model fallback; API key rotation remains available. Running provider calls are not interrupted. Settings persist in the existing `AdminAuditLog` as `SYSTEM_SETTING` events, so this update requires no new database migration. Preserve these events when archiving audit data. Telegram mutation events use the update ID for deduplication; repeated webhook deliveries cannot apply an old change or reset new usage again.

## Jobs and measurements

Jobs requires the existing `20261115000002_transcription_jobs` migration and scoped-cache migration used by background transcription. On a legacy database the panel displays “unavailable” rather than an empty queue. It shows server background jobs only: uploads still in the browser and streaming transcription requests are not included. Existing job expiry/cleanup rules still apply, so this is not a permanent job archive.

Retry is available for queued, failed, or interrupted jobs whose upload is unexpired and attempts remain. Active, completed, expired, or exhausted jobs cannot be retried. The worker’s atomic lease and completion transaction prevent duplicate history/usage. Retries are recorded as `JOB_RETRY` audit events. A quota reset uses the existing `quota_reset` usage status and records `QUOTA_RESET` atomically.

Unknown latency, missing probes, and unmeasured provider quotas are labelled explicitly. Recorded success rate uses successful and failed usage records; separate incident reports are not treated as additional failed requests. Quota reset records remain successes, while quota grants are excluded from operational counts. Token totals and costs remain estimates, not provider billing.

## Validation

Run `npm run build`, `npm run lint -- --quiet`, and `npm run test:panel`. The integration suite uses disposable PGlite databases (before and after migrations), mocked Gemini/Telegram APIs, and headless Edge. It checks authorization, persistent controls, Safe Mode, retry eligibility, job completion, webhook replay protection, quota reset, and desktop/mobile admin interaction.
