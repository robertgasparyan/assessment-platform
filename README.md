# Assessment Platform

Assessment Platform `v1.0` is a full-stack team assessment management app for creating reusable assessment templates, running collaborative team assessments, and reviewing results across teams over time.

## Version 1.0 Scope

- Versioned assessment templates with reusable categories, domains, and questions
- Collaborative team-level assessment runs with draft/save/submit workflow
- Assessment periods for quarter, custom range, and point-in-time reviews
- Operational assessment management for active, submitted, and archived runs
- Results and reporting views for team history and cross-team current-state analysis
- Real user management with roles, team membership, login, logout, and password management
- Team groups, team profiles, and team activity summaries for organizing assessment ownership
- Invitation-based onboarding with activation links and forced first password setup
- Report sharing for submitted results via tokenized read-only links
- Optional SMTP-backed email sending for submitted reports when enabled by an admin
- PDF export via print-optimized report views and Excel-friendly CSV export
- Admin export workspace for portable/full JSON export and PostgreSQL dump download
- Admin-controlled AI configuration with provider selection, connection testing, and global enable/disable
- Audit trail and in-app notifications for key operational events

## Stack

- Frontend: React, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS, Recharts, `sonner`, `lucide-react`, and shadcn/ui-style components
- Backend: Node.js, Express, TypeScript, and Zod request validation
- Database: PostgreSQL with Prisma ORM

## Main Product Areas

- `Dashboard`: lightweight operational overview with quick links and latest submitted team state
- `Assessments`: create runs, continue active work, manage submitted and archived runs
- `My Assessments`: assigned and team-visible work queue for the current signed-in user
- `Templates`: author and version reusable assessment templates
- `Reports`: cross-team reporting and current-state analysis
- `Administration`: admin workspace for user management, system configurations, and audit trail
- `Teams`: manage teams, team groups, memberships, and team assessment activity
- `Libraries`: manage reusable categories, domains, and questions

## Authentication

- The app now starts behind a login screen.
- Auth model is a simple bearer-token session backed by PostgreSQL.
- Current seeded default administrator:
  - username: `admin`
  - password: `admin`
- Password change and logout are available from the profile menu in the top-right of the app shell.
- User management, email configuration, and audit review are available from the `Administration` section for administrators.
- `Administration > Data Model` also includes relationship maps plus JSON and PostgreSQL backup/export tools.
- `Administration > Configurations` also includes application branding, spotlight-search controls, and global AI settings for `Ollama`, `OpenAI`, `Claude`, and `Gemini`.
- Supported roles:
  - `ADMIN`
  - `TEMPLATE_MANAGER`
  - `TEAM_LEAD`
  - `TEAM_MEMBER`
  - `VIEWER`
- Compact role scope guide:
  - [ROLES_AND_PERMISSIONS.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/ROLES_AND_PERMISSIONS.md)
- New users and admin password resets can require a password change on next login.
- Admins can generate one-time activation links so users set their own password instead of receiving a permanent shared credential.

## Version 1.0 Features

- Template authoring flow with `Setup`, `Compose`, and `Review`
- Optional AI-assisted template authoring, guided AI template builder, and one-shot AI draft generation
- Managed categories instead of free-text category entry
- Reusable domain and question libraries
- Template drafts, published versions, edit-as-new-version flow, and usage guards
- Assessment run creation with duplicate-run detection, assigned owner user, due date, and flexible periods
- Assignment history on assessment runs so ownership changes are visible over time
- Run lifecycle with `DRAFT`, `IN_PROGRESS`, `SUBMITTED`, and `ARCHIVED`
- Role-aware navigation and backend access control for templates, libraries, users, teams, assessments, and reports
- Teams workspace with optional team groups, group metrics, team profiles, membership management, and compact/card directory views
- Dashboard `My work` section for assigned runs and team-visible active work
- Dedicated `My Assessments` page for assigned active runs, team queue, and submitted access
- Autosave and manual save while taking assessments
- Stronger assessment progress visibility with unanswered-state cues and submit confirmation
- Submission summary notes
- Presentation mode with facilitator agenda, next-unanswered shortcuts, and domain progress cues
- Spotlight search / command palette for quick page navigation, with admin enable/disable
- Results page with:
  - `Overview`, `Compare`, and `Peers`
  - executive summary
  - radar chart
  - domain score bars
  - selected-domain question score bars
  - domain trend
  - same-team baseline comparison
  - compact print summary
  - optional AI Brief for submitted runs with recommendations, copy action, cache/regenerate, and submitted-data guardrails
- Reports page with:
  - `Latest per team`
  - `Latest per team + assessment`
  - summary cards
  - leading-rows and needs-attention highlights
  - active filter chips for the current reporting lens
  - score-by-team chart
  - domain snapshot
  - question snapshot when filtered
  - current-state table sorting and inline row expansion for domain drilldown
  - optional AI Brief for the current filtered reporting lens with cache/regenerate and submitted-data guardrails
- Report sharing:
  - dedicated report-sharing workspace on submitted results
  - read-only share links for submitted results
  - selectable expiry, copy/open actions, and revoke flow for shared links
  - optional direct email sending for submitted reports when SMTP is configured and enabled
- Export:
  - PDF via print-optimized report views
  - multiple Excel-friendly CSV exports for results and reports
  - portable JSON export for application-aware data transfer
  - full JSON export for privileged backup workflows
  - PostgreSQL dump download when `pg_dump` is available to the backend
- Audit and notifications:
  - audit trail inside the Administration section
  - audit coverage for team, team group, and membership changes
  - in-app notifications for assignments, submissions, due-soon, and overdue runs

## AI Notes

- AI is controlled by a global admin master switch.
- If AI is disabled in `Administration > Configurations`, all AI features are hidden/disabled across the app.
- Supported providers:
  - `Ollama`
  - `OpenAI`
  - `Claude`
  - `Gemini`
- Default local provider setup is:
  - base URL `http://192.168.1.1:11434`
  - model `gpt-oss:20b`
- Current AI surfaces:
  - `Results` AI Brief
  - `Reports` AI Brief
  - `Templates` AI assist for question/domain refinement and consistency review
  - `Templates > AI Builder` for guided and one-shot draft generation
- AI-generated content is intended as a draft or narrative aid, not as stored workflow truth.

See [FEATURES_V1.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/FEATURES_V1.md) for the fuller v1.0 feature inventory.

## Setup

1. Copy [`.env.example`](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/.env.example) to `.env` and set your database, SMTP, and optional AI credentials as needed.
2. Install dependencies: `npm install`
3. Push the Prisma schema: `npm run db:push`
4. Seed demo data: `npm run db:seed`
5. Start the app: `npm run dev`

## Daily Workflow

- Run the app: `npm run dev`
- Only after Prisma schema changes: `npm run db:push`
- Reseed demo data if needed: `npm run db:seed`

## Installation Guides

- Linux: [INSTALLATION_LINUX.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_LINUX.md)
- macOS: [INSTALLATION_MACOS.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_MACOS.md)
- Index: [INSTALLATION.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION.md)
- Database: [DATABASE.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/DATABASE.md)
- Backup and restore: [BACKUP_AND_RESTORE.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/BACKUP_AND_RESTORE.md)
- Deployment: [DEPLOYMENT.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/DEPLOYMENT.md)
- User guide: [USER_GUIDE.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/USER_GUIDE.md)
- Changelog: [CHANGELOG.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/CHANGELOG.md)

## Database Notes

- Root `.env` is the single source of truth for runtime and Prisma.
- PostgreSQL database name used in local setup: `assessment_platform`
- Prisma wrapper script: `backend/scripts/prisma-cli.mjs`
- Optional PostgreSQL dump executable override: `PG_DUMP_PATH`
- Optional AI secret encryption key: `AI_CONFIG_ENCRYPTION_KEY`

## Current Version

The current repository state should be treated as `Assessment Platform v1.0`.
