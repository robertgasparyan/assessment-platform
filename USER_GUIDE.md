# User Guide

This guide explains how an admin uses Assessment Platform `v1.0`.

## Login

The app now requires login before accessing the admin workspace.

Default seeded administrator credentials:
- username: `admin`
- password: `admin`

After login, open the profile menu in the top-right of the app shell to:
- change password
- logout

The top-right notification button shows:
- new assignments
- reassignment updates
- submitted-run visibility updates
- due soon reminders
- overdue reminders

If an administrator sends you an activation link:
1. open the link
2. set your password
3. continue into the app with the new session automatically

## Main Navigation

- `Dashboard`
- `Assessments`
- `My Assessments`
- `Templates`
- `Reports`
- `Administration`
- `Teams`
- `Libraries`

## Roles

Current platform roles:
- `ADMIN`
- `TEMPLATE_MANAGER`
- `TEAM_LEAD`
- `TEAM_MEMBER`
- `VIEWER`

Compact role matrix:
- [ROLES_AND_PERMISSIONS.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/ROLES_AND_PERMISSIONS.md)

## Administration

Use `Administration` to:
- create platform accounts
- update display name, username, email, and role
- activate or deactivate access
- assign team memberships
- reset passwords
- require password change on next login when needed
- generate activation links for invitation-based onboarding
- configure submitted-report email delivery and SMTP settings
- review the data model relationship maps
- download portable or full JSON exports
- download PostgreSQL dumps when server-side `pg_dump` is available
- configure AI globally for the workspace
- enable or disable AI for the whole platform
- select the active AI provider
- test provider connections
- review the audit trail

Current supported AI providers:
- `Ollama`
- `OpenAI`
- `Claude`
- `Gemini`

Important rule:
- if an administrator disables AI, all AI features across Results, Reports, and Templates are hidden/disabled

## Dashboard

Use the Dashboard to:
- jump quickly to create, active, or submitted assessments
- review `My work` for assigned runs and team-visible queue
- see latest submitted team state
- review lightweight operational summaries

## Libraries

Use Libraries to manage reusable building blocks:
- categories
- domains
- questions

Typical workflow:
1. create categories
2. create reusable questions
3. create reusable domains from those questions

## Teams

Use Teams to:
- create teams
- edit team details
- prepare teams for assessment runs

## Templates

Use Templates to create and manage assessment templates.

### Author a template

1. Open `Templates`
2. Go to `Author`
3. Complete:
   - setup
   - compose
   - review
4. Save the draft or publish the template

AI features inside `Author`:
- improve a question prompt, guidance, and level descriptions
- refine a domain title and description
- run an AI consistency review on the draft before publishing

AI assistance is optional and manual:
- suggestions are shown in-place
- nothing is auto-published
- authors choose whether to apply AI suggestions

### AI Builder

Use `AI Builder` when you want to start from a short brief instead of a blank template.

Guided builder flow:
1. generate a scaffold
2. generate domains
3. generate questions for selected domains
4. continue in the normal authoring studio

One-shot option:
- generate a fuller end-to-end draft from one brief
- move it into the authoring studio for refinement before publishing

Builder controls:
- regenerate a generated domain
- regenerate a domain question set
- keep or discard domains before handoff to authoring

### Drafts

Use `Drafts` to:
- resume unfinished template work
- continue editing before publishing

### Existing Templates

Use `Existing Templates` to:
- review published templates
- edit a template as a new version
- understand usage before attempting deletion

## Assessments

The Assessments section has three tabs.

### Create

Use `Create` to launch a new assessment run.

You can set:
- template
- team
- period
- assigned owner user
- due date

### Active

Use `Active` to:
- continue draft or in-progress runs
- archive runs
- delete draft work
- restore archived runs

Inside a run, authorized users can also:
- reassign the current owner user
- review assignment history

### Submitted

Use `Submitted` to:
- review completed runs
- filter by date or score band
- open detailed results

## My Assessments

Use `My Assessments` to:
- review runs assigned directly to you
- see other active runs visible through your team memberships
- open submitted runs you can access

## Taking an Assessment

Inside an active assessment run you can:
- select maturity levels for each question
- add comments
- rely on autosave
- manually save draft
- jump to the first unanswered question
- submit a final summary note

## Results

Each submitted run has a Results view with:
- `Overview`
- `Compare`
- `Peers`

You can use it to:
- review current state
- compare against a previous submitted run
- inspect domain and question scores
- export a compact PDF-style report summary
- export Excel-friendly CSV data for either domain summary or detailed answers
- open the report sharing workspace for secure link and email-based sharing
- create read-only share links with an expiry period
- send the submitted report by email when the feature is enabled by an administrator
- open, copy, or revoke existing shared report links
- open the optional `AI Brief` for an executive narrative summary

Results AI Brief includes:
- executive summary
- strength signals
- watchouts
- general recommendations
- leadership brief
- copy brief
- submitted-data-only metadata
- last-refreshed metadata
- cache-aware reopen and explicit regenerate

## Reports

Use Reports for cross-team analysis.

Two key views exist:
- `Latest per team`
- `Latest per team + assessment`

Use Reports to answer:
- what is each team’s latest submitted state?
- what is the current state of a team on a specific assessment?
- what is the overall picture across teams?

Reports also support:
- Excel-friendly CSV export for current rows and analytical snapshots
- PDF export via the browser print flow
- optional `AI Brief` for the current filtered reporting view

Reports AI Brief is designed as a separate narrative layer so it does not replace the reporting tables, charts, or snapshots.

## Audit Trail

Administrators can use `Administration > Audit Trail` to review important system activity such as:
- login and logout events
- user creation and updates
- password resets
- assessment run creation, submission, archive, restore, and deletion
- shared report link creation, email sending, and revocation

## Backup And Export

Administrators can open `Administration > Data Model` to:
- review the compact and visual relationship maps
- download a portable JSON export with sensitive auth/share tokens redacted
- download a full JSON export that includes privileged backup fields
- download a PostgreSQL dump in custom or plain SQL format

Administrators can open `Administration > Configurations` to:
- enable or disable AI globally
- choose the active provider
- test provider connectivity
- manage provider URLs, models, and API keys

If the PostgreSQL dump action is disabled:
- the backend could not execute `pg_dump`
- install PostgreSQL client tools or set `PG_DUMP_PATH` in the root `.env`
- restart the backend after changing environment variables

## Notes

- Templates are versioned
- Submitted assessments are read-only
- Current-state reporting is based on the latest submitted assessment period, not just the last click time
- administrators can manage multiple users and role assignments
