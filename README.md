# Assessment Platform

Assessment Platform `v1.0` is a full-stack team assessment management app for creating reusable assessment templates, running collaborative team assessments, and reviewing results across teams over time.

## Version 1.0 Scope

- Versioned assessment templates with reusable categories, domains, and questions
- Collaborative team-level assessment runs with draft/save/submit workflow
- Assessment periods for quarter, custom range, and point-in-time reviews
- Operational assessment management for active, submitted, and archived runs
- Results and reporting views for team history and cross-team current-state analysis
- Simple single-admin authentication with login, logout, and password change

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui-style components
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL with Prisma ORM

## Main Product Areas

- `Dashboard`: lightweight operational overview with quick links and latest submitted team state
- `Assessments`: create runs, continue active work, manage submitted and archived runs
- `Templates`: author and version reusable assessment templates
- `Reports`: cross-team reporting and current-state analysis
- `Teams`: manage teams that participate in assessments
- `Libraries`: manage reusable categories, domains, and questions

## Authentication

- The app now starts behind a login screen.
- Current `v1.0` auth scope is a single admin account.
- Auth model is a simple bearer-token admin session backed by PostgreSQL.
- Default seeded credentials:
  - username: `admin`
  - password: `admin`
- Change the default password after first login from the profile menu in the top-right of the app shell.

## Version 1.0 Features

- Template authoring flow with `Setup`, `Compose`, and `Review`
- Managed categories instead of free-text category entry
- Reusable domain and question libraries
- Template drafts, published versions, edit-as-new-version flow, and usage guards
- Assessment run creation with duplicate-run detection, owner, due date, and flexible periods
- Run lifecycle with `DRAFT`, `IN_PROGRESS`, `SUBMITTED`, and `ARCHIVED`
- Autosave and manual save while taking assessments
- Submission summary notes
- Results page with:
  - `Overview`, `Compare`, and `Peers`
  - executive summary
  - radar chart
  - domain score bars
  - selected-domain question score bars
  - domain trend
  - same-team baseline comparison
  - compact print summary
- Reports page with:
  - `Latest per team`
  - `Latest per team + assessment`
  - summary cards
  - score-by-team chart
  - domain snapshot
  - question snapshot when filtered

See [FEATURES_V1.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/FEATURES_V1.md) for the fuller v1.0 feature inventory.

## Setup

1. Copy [`.env.example`](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/.env.example) to `.env` and set your database credentials.
2. Install dependencies: `npm install`
3. Push the Prisma schema: `npm run db:push`
4. Seed demo data: `npm run db:seed`
5. Start the app: `npm run dev`

## Daily Workflow

- Run the app: `npm run dev`
- Only after Prisma schema changes: `npm run db:push`
- Reseed demo data if needed: `npm run db:seed`

## Installation Guides

- Windows: [INSTALLATION_WINDOWS.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_WINDOWS.md)
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

## Current Version

The current repository state should be treated as `Assessment Platform v1.0`.
