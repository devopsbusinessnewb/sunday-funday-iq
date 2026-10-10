# CBS reboot recovery

## Verified installation — October 9, 2026

The live Windows installation report at 16:07 Central confirms:
- All three lifecycle tests passed.
- Authenticated collection succeeded at 2026-10-09T21:07:36.380896Z.
- Snapshot commit cb63399e5c168014a82e2a07cb95a85cb72f1026 was confirmed on origin/main.
- Automatic publishing is enabled.
- The 15-minute automatic update task is installed.

This verifies that collection and publication worked at that time. It does not establish continuous availability, scheduled execution, or successful startup before sign-in.

## Current gap

The earlier live inventory showed the server task using an interactive account and a logon trigger. Nine refresh tasks also used interactive logon. The new updater was installed subsequently; its installer uses the signed-in user. None of these observations proves that the tasks can run before sign-in after a reboot.

A read-only report is available:
`powershell.exe -NoProfile -File tools\test-cbs-reboot-readiness.ps1`

It collects task lifecycle metadata and local bridge status. It does not display task arguments, browser contents, credentials, or configuration values. It makes no changes. A missing bridge produces an unavailable status, never a healthy result.

## Recommended implementation

Preserve the existing Windows identity, its browser profile, and its GitHub credentials. Configure the CBS server, nine refresh tasks, and updater to run whether that user is signed in or not, using Task Scheduler password logon. Add a delayed boot trigger to the server while retaining the existing refresh schedules and updater interval.

The password must be entered locally into Windows; it must never be sent through chat, committed to Git, or written to a credential file by platform scripts. A Windows Hello PIN is not the task account password. Account-specific authentication may require additional setup; do not force a different identity to bypass it.

Do not replace the account with SYSTEM or use S4U as a shortcut. Microsoft documents that S4U lacks access to network resources and encrypted files. A different identity also changes the browser/profile and credential context.

Use limited task privileges. Set the server execution-time limit to unlimited, ignore overlapping instances, and add bounded restart-on-failure. StartWhenAvailable supports missed schedules but does not itself prove freshness or guarantee successful CBS collection.

Before making changes:
1. Verify task identity, schedules, and current idle state.
2. Save each original task definition locally outside the repository with restricted access. Definitions may contain sensitive action arguments; do not upload them.
3. Prepare rollback to the original interactive task registrations.
4. Ensure that rerunning existing task installers will not revert the new logon mode. The current updater installer needs this protection before the migration can be considered durable.

After making changes:
1. Start the server through Task Scheduler in its new logon context.
2. Check bridge health and complete an authenticated refresh.
3. Confirm snapshot publication to GitHub.
4. Perform a controlled reboot only during an agreed maintenance window.
5. Verify collection/publication before anyone signs into Windows. An after-sign-in check is insufficient.

## Rollback and operating limits

If the new logon context cannot access the CBS session or publish, restore the saved interactive task registrations and start the original server task. Keep the existing browser profile unchanged. Do not auto-login Windows, reset browser sessions, discard repository changes, or disable security controls.

## Bundled unattended setup

Run tools/enable-cbs-unattended.ps1 explicitly from elevated Windows PowerShell under the existing CBS account. It prompts locally for that account's password. It requires all 11 expected tasks to be enabled, interactive, and owned by the same current user. It defers while known refreshes or updates are active.

The script backs up original task XML under C:\\Server\\Backups\\CBS-Tasks with access limited to the current account, SYSTEM and Administrators. It disables scheduled launches, rechecks idle state, stages disabled password-logon registrations, starts the bridge in that context, validates authenticated collection and remote snapshot publication, then enables remaining tasks. It does not reboot or change the browser profile. On migration failure it attempts to restore all original interactive definitions and restart the original bridge. Task registration passwords are only passed in memory to Windows; they are not written by the script.

Manual recovery, from elevated PowerShell:
`& .\\tools\\restore-cbs-task-backup.ps1 -BackupDirectory 'the directory printed by setup'`

The task backups are local recovery copies, not off-device backups. Do not upload them. Updating the Windows account password later requires updating these task credentials locally.

Both legacy installers now protect existing unattended registrations: the production installer refuses to recreate them; the updater installer preserves an existing password-logon task with the expected action.

Windows CI checks script syntax and uses the native Task Scheduler serializer to verify identity, action and schedule preservation, disabled staging, delayed boot, and nonduplicating triggers. It does not exercise live account credentials, CBS authentication, task registration rollback, or startup before sign-in.

The live migration and controlled reboot test remain pending until this setup is run on EICKHOFF-SERVER. A successful migration report proves the new execution context works while Windows is signed in; it does not prove behavior after reboot. Do not reboot automatically as part of installation.

## Platform boundaries and follow-up

CBS-specific parsing and product logic remain owned by Sunday Funday IQ. Server Platform owns task lifecycle, operational health, logging conventions, and recovery.

Next: finish reboot recovery, define freshness against expected refresh schedules, expose sanitized health in the Command Center, and protect important server state with backup and restore validation. Board worker follows CBS.

The preserved local guillotine.json is a separate data-location issue. Do not silently exclude all untracked files from update checks or move production data again without identifying its producer and consumers.

## Primary references

- Microsoft task logon types: https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-logontype-principaltype-element
- Register-ScheduledTask parameters: https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask
