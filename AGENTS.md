# Assessment Platform Notes

## Product version

- The current repository baseline should be treated as `Assessment Platform v1.0`.
- Public-facing high-level feature inventory lives in [FEATURES_V1.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/FEATURES_V1.md).
- Public-facing setup overview lives in [README.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/README.md).
- Additional public-facing docs:
  - deployment: [DEPLOYMENT.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/DEPLOYMENT.md)
  - user/admin usage: [USER_GUIDE.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/USER_GUIDE.md)
  - release history: [CHANGELOG.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/CHANGELOG.md)

## Authentication conventions

- `v1.0` now includes simple admin authentication.
- Current scope is intentionally limited to one admin user.
- The app should load behind a login screen until a valid admin session exists.
- Current auth model:
  - persisted `AdminUser` record in PostgreSQL
  - bearer token session stored on the admin user record
  - `login`, `logout`, and `change password` only
- Seed data must create a default admin account:
  - username `admin`
  - password `admin`
- The login screen should stay clean:
  - no prefilled credentials
  - no visible default `admin / admin` helper copy on the page itself
- The UI should make password change and logout available from a profile control in the shell after login, not as a permanent sidebar form block.
- Broader user management, roles, and multi-user auth remain version 2 work.

## Product structure

- Single-company assessment management platform.
- Templates are versioned. Editing an existing template should create a new template version, not mutate prior assessment snapshots.
- Assessment runs are collaborative team-level responses for a selected team and period.
- Assessment periods are no longer quarter-only. Current supported period types are `QUARTER`, `CUSTOM_RANGE`, and `POINT_IN_TIME`.
- Export/auth can come later; current focus is template authoring, reusable content, and team management.

## Core admin areas

- `Templates`: compose templates and publish versions.
- `Libraries`: manage reusable categories, domains, and questions directly, not only through template authoring.
- `Teams`: manage teams that can be assigned to assessment runs.
- `Assessments`: create, continue, and review assessment runs.
- `Reports`: deeper analysis of submitted data across teams. This is the place for cross-team current-state reporting, not day-to-day run operations.

## Assessments page conventions

- The Assessments page should separate tasks by intent, not keep creation and browsing in one long page.
- Current top-level tabs are:
  - `Create`
  - `Active`
  - `Submitted`
- `Create` should stay lightweight. The temporary `Run preview` block was intentionally removed because it duplicated the form.
- `Create` now also supports:
  - optional `ownerName`
  - optional `dueDate`
  - duplicate-run detection for the same team/template/period before launch
- `Active` is the operational surface for draft/in-progress runs.
- `Submitted` is the reporting/archive surface for completed runs.
- `Submitted` is also the primary detailed filtering surface for completed assessments. Keep the Dashboard lightweight and move deeper search/filter behavior into this tab instead of expanding dashboard controls.
- Run lifecycle now includes:
  - `DRAFT`
  - `IN_PROGRESS`
  - `SUBMITTED`
  - `ARCHIVED`
- Active-table actions should include:
  - `Continue`
  - `Archive`
  - `Delete`
- Active runs should be editable at the run-detail level for safe metadata only:
  - `title`
  - `ownerName`
  - `dueDate`
  - `periodLabel`
- Submitted runs should remain read-only for run metadata edits.
- Archived runs should remain visible in the Active tab as a separate section with a `Restore` action.
- Restoring an archived run should return it to:
  - `IN_PROGRESS` if it already has responses
  - `DRAFT` if it has no saved responses
- The selected Assessments tab is mirrored in the URL query string using `?tab=create|active|submitted`.
- Links from Assessments rows should preserve return context:
  - active row actions pass `state.returnTo = "/assessments?tab=active"`
  - submitted row actions pass `state.returnTo = "/assessments?tab=submitted"`
- The assessment run page uses router navigation for `Back to all assessment runs` and should default to `/assessments?tab=active` if no return state exists.

## Results page conventions

- The results page is meant to support review and decision-making, not only display charts.
- Results should include executive summary, previous-run deltas, strengths/focus areas, score distribution, and domain drilldown.
- Same-team comparison over time is primary. Same-period peer comparison is secondary context.
- Results UX is intentionally split by purpose:
  - `Overview` for current report
  - `Compare` for explicit baseline comparison
  - `Peers` for optional same-period cross-team context
- Results page has a compact print-only summary instead of printing the entire interactive page.
- Radar labels should wrap for long domain names and support interaction with the domain breakdown.
- Results now also include:
  - domain-over-time trend view, not just overall trend
  - compare-aware print summary content when the `Compare` tab is active
- Suggested improvement plans / action items are intentionally deferred until AI-backed generation and/or real persistence is designed. Results should not present invented recommendation records as if they are stored workflow objects.
- Result-page improvements that still fit the current non-AI product scope:
  - reviewer notes
  - domain-based filtering
  - sort controls for detailed answer review
  - comment-focused review mode

## Reports section conventions

- `Reports` should answer cross-team questions such as:
  - what is each team's latest submitted assessment state?
  - what is the current overall picture across teams?
- There are two distinct current-state views:
  - `Latest per team`: latest `SUBMITTED` run for each team overall
  - `Latest per team + assessment`: latest `SUBMITTED` run for each `team + template`
- For “current state of Team Alpha on Engineering Assessment”, the correct reporting surface is `Latest per team + assessment`.
- `Reports` is not a duplicate of Dashboard and not a duplicate of a single Results page.
- The first reporting surface is `Latest by team`, which should include:
  - organization-level summary cards
  - filters for team/template/category/domain/question
  - a current score-by-team chart
  - a domain snapshot across the filtered latest submitted team runs
  - a question snapshot when a specific question filter is active
  - a latest-by-team detailed table with strongest/weakest domain context
- Dashboard stays lightweight; deeper submitted-data analysis belongs in `Reports`.
- Reports should feel visually more intentional than Dashboard:
  - a stronger hero/header section is acceptable
  - summary cards can use more differentiated tones
  - filters and analytical snapshots should read as a reporting workspace, not as an operations table

## Current-state selection rule

- A current-state reporting row must always come from a run with `status = SUBMITTED`.
- Current-state selection ordering is:
  1. `periodSortDate DESC`
  2. `createdAt DESC`
- This rule is used for:
  - latest per team
  - latest per team + template
- If another consumer reads directly from the database, they should use that same ordering to identify the latest submitted row.

## Template authoring conventions

- Categories are managed data and should be selected from the categories list, not entered as free text.
- Domains and questions are reusable library content.
- The Libraries page should support first-class creation/editing of questions and domains.
- Domain/question library actions should include duplicate and confirmed delete flows because these items are shared reusable content.
- Reusing a domain/question into a template should copy it into the draft/template, not live-edit the shared source by default.
- Draft templates may be incomplete.
- Library items must be complete before saving:
  - domain title required
  - question prompt required
  - level descriptions required

## Compose step UX conventions

- Left panel: template/domain structure.
- Center panel: selected domain workspace and ordered question list.
- Right panel: utility panel with tabs for `Editor`, `Questions`, and `Domains`.
- Clicking a question should focus it and switch the right panel to `Editor`.
- Drag-and-drop is used for domain/question ordering.

## Current persistence model

- PostgreSQL via Prisma.
- Managed entities:
  - `AdminUser`
  - `Category`
  - `Team`
  - `TemplateDraft`
  - `QuestionLibraryItem`
  - `DomainLibraryItem`
  - versioned template entities
- `AssessmentRun` now also stores:
  - `ownerName`
  - `dueDate`
  - `submissionSummary`
- Template summaries/details should expose usage information so the UI can show whether a template is already in use.
- Templates that are already used by assessment runs must not be deletable.
- Template preview should surface recent usage context, not only version structure.
- Library questions/domains should expose lightweight usage counts:
  - drafts using them directly via `libraryId` when available
  - published template usage via snapshot-title/prompt matching
- Usage counts are governance signals, not strict lineage guarantees, because published template versions currently snapshot content rather than persist library item IDs.
- Due dates are operational, not decorative:
  - run tables should show urgency badges
  - overdue runs should be filterable
  - due-state filtering should support at least `Overdue`, `Due soon`, `Scheduled`, and `No due date`
  - the assessment run detail header should carry the same due-date urgency signal
- Submitted-run filtering should go beyond the shared operational filters and support dedicated completed-run review fields such as submitted date range and score-band filtering.

## Dashboard conventions

- The Dashboard should remain lightweight and operational, not become a full reporting console.
- Current quick links should stay limited to:
  - `Create assessment`
  - `Active assessments`
  - `Submitted assessments`
- Those quick links should remain visually distinct, but aligned with the current green/grey product palette rather than older amber/emerald styling notes.
- `Latest submitted by team` is an important compact dashboard section and should sit above broad trend charts so recent team state is easier to scan quickly.
- Lightweight search inside `Latest submitted by team` is acceptable.
- Deeper filtering/search belongs in `Assessments > Submitted` or a future dedicated `Reports` section, not in the Dashboard.

## Design system conventions

- Current core palette:
  - primary green `#72BF44`
  - light green `#EEF8E8`
  - light grey `#F4F4F4`
  - mid grey `#D9D9D9`
  - dark grey `#555555`
  - primary text `#333333`
  - white `#FFFFFF`
- New UI polish should preserve the current green/neutral direction instead of reintroducing unrelated blue/purple-heavy accents.

## Environment and DB workflow

- Root `.env` is the single source of truth.
- Backend runtime loads root `.env` through `backend/src/env.ts`.
- Prisma wrapper is `backend/scripts/prisma-cli.mjs`.
- Public database setup and structure guide lives in [DATABASE.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/DATABASE.md).
- Normal run command:
  - `npm run dev`
- If Prisma schema changes:
  - `npm run db:push`
- Seed demo/admin data:
  - `npm run db:seed`

## Windows/Prisma caveat

- On Windows, Prisma client generation can hit `EPERM` on `query_engine-windows.dll.node` if the file is locked by a running process.
- `npm run db:push` usually still succeeds in syncing the database schema even if generate reports that lock error.
- If Prisma generation becomes blocked, stop running backend/dev processes and rerun `npm run db:push`.

## Implementation preferences already chosen

- Categories should be managed centrally.
- Teams should have their own dedicated admin page.
- Domain/question library management should be separated from template composition.
- Domain management in Libraries should compose a domain from reusable questions chosen from the question library.
- Edit mode for templates must have an explicit exit path.
- Template editing should be visually obvious when active.
- Route-level lazy loading is in place for major pages; preserve that pattern for new heavy views.
- Assessment-taking UX should reduce manual effort:
  - autosave drafts
  - show domain completion clearly
  - let users jump to the first unanswered question
  - allow a submission summary note before final submit
