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
- manage reusable external contacts for guests and outside participants
- configure submitted-report email delivery and SMTP settings
- review email delivery history and failed send attempts
- review security hygiene metrics for sessions, activation invites, and external participant links
- review active external participant links that can still be used
- clear expired sessions and activation invites
- update the application title shown across the shell and login screens
- enable or disable spotlight search / command palette
- review the data model relationship maps
- download portable or full JSON exports
- download PostgreSQL dumps when server-side `pg_dump` is available
- configure AI globally for the workspace
- enable or disable AI for the whole platform
- select the active AI provider
- test provider connections
- review the audit trail

External contacts:
- open `Administration > External Contacts`
- create or edit reusable outside people with name, email, organization, and notes
- use those contacts later when creating guest assessment links
- open a contact profile to review individual participant history, guest-link history, and recent participant emails
- contacts with linked assessment history are protected from deletion

Email delivery history:
- open `Administration > Configurations`
- review recent participant invites, guest invites, and submitted-report email attempts
- use status and error messages to diagnose SMTP configuration or recipient delivery issues

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

Quick navigation:
- when spotlight search is enabled by an administrator, press `Ctrl+K` or `Cmd+K`
- use it to jump quickly to core pages like `Create assessment`, `Submitted assessments`, `Templates`, `Reports`, or `Users`

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
- create optional team groups
- organize teams into groups
- search and filter the team directory
- switch between card and compact list views
- review group-level metrics
- open team profiles
- manage team members from a team profile
- create an assessment directly for a selected team
- prepare teams for assessment runs

Team groups are optional. A team can stay ungrouped until a department, region, function, or program structure is useful.

Team profiles show:
- current members
- active assessments
- submitted assessments
- latest submitted score

Removal actions for teams, groups, and members include confirmation guardrails. Teams with assessment history are protected from deletion to preserve reporting history.

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

AI-assisted authoring:
- use `AI Builder` for guided scaffold/domain/question generation
- inside the authoring studio, use AI to improve or generate a question directly from the compose flow

AI features inside `Author`:
- improve a question prompt, guidance, and level descriptions
- refine a domain title and description
- run AI Template Reviewer on the draft before publishing

AI assistance is optional and manual:
- suggestions are shown in-place
- nothing is auto-published
- authors choose whether to apply AI suggestions

### AI Chat

Use `AI Chat` when you want to create a template conversationally. This section is separate from the guided builder so the AI creation paths stay easier to understand.

Chat-based builder flow:
1. describe the assessment you want in natural language
2. answer AI clarifying questions when more scope is needed
3. generate a normal editable draft
4. continue in the authoring studio or save the draft for later review

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

AI Template Reviewer checks:
- publish blockers
- readiness score
- risk level
- strengths and issues
- domain balance
- maturity-scale quality
- practical suggestions for manual refinement

Builder controls:
- regenerate a generated domain
- regenerate a domain question set
- keep or discard domains before handoff to authoring

### Drafts

Use `Drafts` to:
- resume unfinished template work
- continue editing before publishing
- review the publish-readiness checklist
- mark complete drafts as `Ready for review`

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
- response mode:
  - `Shared team response` for the current workshop-style collaborative flow
  - `Individual team member responses` when selected team members should answer separately
- individual response participants can include registered team members and reusable external contacts
- minimum individual participant submissions before aggregation, when using individual response mode

### Active

Use `Active` to:
- continue draft or in-progress runs
- copy existing runs into new drafts without copying responses
- archive runs
- delete draft work
- restore archived runs

Inside a run, authorized users can also:
- reassign the current owner user
- review assignment history
- manage internal and external participant lists for individual response runs
- save reusable external contacts and create guest links from those contacts
- send invite emails to internal participants and guest-link recipients when email delivery is configured
- send invite emails to external individual participants; they receive a tokenized response link and do not need a platform account
- send participant reminder emails
- send bulk invites or reminders to all non-submitted participants with an email address
- search and filter participants by status or participant type
- copy all pending external participant links at once
- review each participant's latest invite/reminder delivery status and full recent email history
- generate AI aggregation insight before aggregation to review disagreement, comment themes, and facilitator questions
- update expiry, regenerate, or revoke external participant response links
- remove participants before they have saved responses
- aggregate submitted individual responses into the final team-level submitted result

### Submitted

Use `Submitted` to:
- review completed runs
- filter by date or score band
- open detailed results
- copy a submitted run into a new draft when a similar future assessment is needed
- archive submitted runs as an administrator without deleting submitted data

## My Assessments

Use `My Assessments` to:
- answer individual team-member assessments assigned to you
- review runs assigned directly to you
- see other active runs visible through your team memberships
- open submitted runs you can access

## Taking an Assessment

Shared team response runs:
- select maturity levels for each question
- add comments
- rely on autosave
- manually save draft
- jump to the first unanswered question
- submit a final summary note

Individual team-member response runs:
1. open `My Assessments`
2. use the `My responses` section
3. answer questions in the dedicated individual assessment workspace
4. submit your individual response after all questions are answered

External individual participant runs:
1. the assessment owner adds reusable external contacts as participants
2. the owner copies the tokenized response link or sends an email invite
3. the external participant opens the link without logging in
4. the external participant answers and submits the same individual response workflow

Managers can then aggregate submitted individual responses. Aggregation:
- uses submitted participant responses only
- averages answers per question
- maps the average to the nearest maturity level
- writes the final team-level responses
- submits the run so normal Results and Reports work

## Results

Each submitted run has a Results view with:
- `Overview`
- `Compare`
- `Peers`

You can use it to:
- review current state
- see whether a result was aggregated from individual team-member responses
- review group-level current-state snapshots by team group
- compare against a previous submitted run
- inspect domain and question scores
- export a compact PDF-style report summary
- export Excel-friendly CSV data for either domain summary or detailed answers
- create and track action-plan items with owner label, due date, domain context, and status
- open the report sharing workspace for secure link and email-based sharing
- create read-only share links with an expiry period
- send the submitted report by email when the feature is enabled by an administrator
- open, copy, or revoke existing shared report links
- open `AI Report Deep Dive` for prompt shortcuts, report-scoped Q&A, and an optional executive narrative summary

Results AI includes:
- prompt shortcuts for common leadership and risk questions
- free-form report-scoped questions
- supporting points and source labels for AI answers
- executive summary
- strength signals
- watchouts
- general recommendations
- leadership brief
- copy brief
- submitted-data-only metadata
- last-refreshed metadata
- cache-aware reopen and explicit regenerate

AI Report Deep Dive answers are limited to the submitted report, selected baseline, comments, domain scores, and aggregation metadata.

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
- team, team group, and team membership changes
- assessment run creation, submission, archive, restore, and deletion
- shared report link creation, email sending, and revocation
- filter by entity type and actor
- export the filtered audit trail to CSV

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
