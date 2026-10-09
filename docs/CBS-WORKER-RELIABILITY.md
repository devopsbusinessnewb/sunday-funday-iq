# CBS worker lifecycle

All collector invocations and interactive login acquire an OS file lock inside
the configured CBS browser profile before opening it. A competing invocation
exits with code 75 without launching a browser or replacing the active run's
status. The OS releases the lock after process termination. Separate profiles
have separate locks; do not configure multiple profiles to share one status path.

Collector outcomes are saved atomically in
`%LOCALAPPDATA%\SundayFundayIQ\worker-state\collector-status.json` by default.
`SFIQ_CBS_STATE_DIR` overrides this directory. Keep this state outside Git.
Only run identifiers, timestamps, outcome and exception type are recorded;
raw page data, URLs, cookies and exception messages are excluded.

`GET /status` adds a `collector` object covering both scheduled and server-launched
collections. Existing response fields are preserved. `lastSuccessAt` means the
collector received a successful sanitizer/publisher response; it does not prove
a hosting deployment completed. Check autoPush and deployment evidence separately.

A recorded `running` outcome after a process crash is historical evidence,
not a heartbeat. A later run replaces it. Unknown/corrupt state returns an empty
object. This patch does not add periodic heartbeats or automated retries.

Deployment: install all three Python files together and restart the CBS bridge
when no refresh is active. No task changes or new credentials are required.
Rollback: restore the previous collector and bridge together; the new runtime
module and state file can remain unused. The authenticated profile is preserved.

Windows and Linux CI verify contention and lock release after termination,
durable outcomes and privacy-safe failure records. Actual Windows scheduled
collection and CBS authentication still require live-server verification.
Sign-in-dependent startup, missing updater installation, and wider scheduling
changes remain separate follow-up work.
