# Database Guide

This project uses PostgreSQL with Prisma. The Prisma schema is the source of truth for the database structure.

Schema file:
- [schema.prisma](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/backend/prisma/schema.prisma)

## Source of Truth

- Database engine: PostgreSQL
- ORM and schema management: Prisma
- Prisma schema location: `backend/prisma/schema.prisma`
- Runtime connection variable: `DATABASE_URL`

Do not maintain a separate manual SQL schema as the primary source of truth. Use Prisma for schema updates and database synchronization.

## Create a Database From Zero

Example database name used in local development:
- `assessment_platform`

### 1. Create the PostgreSQL database

Example with `psql`:

```sql
CREATE DATABASE assessment_platform;
```

### 2. Configure `.env`

Root [`.env`](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/.env) is the single source of truth.

Example:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/assessment_platform?schema=public"
PORT=4000
CLIENT_URL="http://localhost:5173"
PG_DUMP_PATH="C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
AI_CONFIG_ENCRYPTION_KEY="replace-with-a-long-random-secret"
OLLAMA_BASE_URL="http://192.168.1.1:11434"
OLLAMA_MODEL="gpt-oss:20b"
```

### 3. Install dependencies

```powershell
npm install
```

### 4. Apply the Prisma schema

```powershell
npm run db:push
```

This creates the tables in the target PostgreSQL database based on the Prisma schema.

### 5. Seed starter data

```powershell
npm run db:seed
```

This loads demo/reference data used by the app.

### 6. Run the application

```powershell
npm run dev
```

## Main Data Areas

The database currently stores these main entity groups:

- `User`
- `UserTeamMembership`
- `Category`
- `TeamGroup`
- `Team`
- `TemplateDraft`
- `QuestionLibraryItem`
- `DomainLibraryItem`
- versioned template entities
- `AssessmentRun`
- assessment responses and result-related snapshot data
- `ReportShareLink`
- `AuditLog`
- `Notification`
- `PlatformSetting`
- `AiAssessmentSummary`
- `AiReportsBrief`

## Important Product Rules Reflected in the Data Model

### Versioned templates

- Published templates are versioned.
- Editing an existing template should create a new version, not rewrite historical assessment snapshots.

### Reusable library content

- Questions and domains can be managed as reusable library content.
- Published template versions snapshot content, so usage counts are governance signals rather than strict lineage guarantees.

### Assessment run periods

Assessment runs support:
- `QUARTER`
- `CUSTOM_RANGE`
- `POINT_IN_TIME`

### Assessment run lifecycle

Assessment runs currently use:
- `DRAFT`
- `IN_PROGRESS`
- `SUBMITTED`
- `ARCHIVED`

### Admin authentication

- `User` stores platform accounts.
- `role`, `isActive`, and team memberships support the first real user-management model.
- `mustChangePassword` supports first-login onboarding and admin-forced password resets.
- `inviteToken` and `inviteExpiresAt` support one-time account activation links.
- `sessionToken` and `sessionExpiresAt` are used for the current bearer-token session model.
- Seed data creates a default administrator with:
  - username `admin`
  - password `admin`
- The app UI no longer shows those default credentials on the login page; they are documented here and in the user/setup docs only.

### Teams and groups

- `TeamGroup` stores optional team categorization such as department, region, function, or program.
- `Team.groupId` links a team to a group when grouping is useful.
- Ungrouped teams remain valid.
- `UserTeamMembership` stores team membership and lead/member assignment for users.

### Assessment ownership

- `AssessmentRun.ownerUserId` stores the real assigned owner user when a run is explicitly assigned.
- `ownerName` remains as the display snapshot returned to the UI and preserved in run metadata.
- `AssessmentRunAssignment` stores ownership history, including who changed the assignment, the previous owner, and the next owner.

### Shared reports and governance

- `ReportShareLink` stores tokenized read-only access for submitted results.
- `AuditLog` stores key governance events for users, runs, report sharing, teams, team groups, and team memberships.
- `Notification` stores user-level in-app alerts such as assignment and submission events.

### AI configuration and cache

- `PlatformSetting` stores global workspace configuration, including AI provider settings.
- Provider secrets entered through admin configuration are stored encrypted in the database.
- `AiAssessmentSummary` stores cached AI Brief output for submitted Results runs.
- `AiReportsBrief` stores cached AI Brief output for filtered Reports narratives.
- If AI is disabled by admin configuration, AI surfaces should be hidden/disabled across the app.

### Current-state reporting rule

Current-state reporting rows must come from `SUBMITTED` runs only.

Selection rule:
1. `periodSortDate DESC`
2. `createdAt DESC`

This is how the app determines:
- latest per team
- latest per team + assessment

## How To Rebuild the Schema Later

If the Prisma schema changes:

```powershell
npm run db:push
```

For the current v1 baseline, `TeamGroup` and `Team.groupId` are part of the schema. Live environments should run `npm run db:push` after pulling these changes so the database is synchronized before users manage team groups.

If you also want fresh demo/reference data:

```powershell
npm run db:seed
```

## Export and Import

Detailed OS-specific instructions live in:
- [INSTALLATION_LINUX.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_LINUX.md)
- [INSTALLATION_MACOS.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_MACOS.md)
- Shared index:
  - [INSTALLATION.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION.md)
- Dedicated backup/restore guide:
  - [BACKUP_AND_RESTORE.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/BACKUP_AND_RESTORE.md)

Typical PostgreSQL tools:
- export: `pg_dump`
- restore custom dump: `pg_restore`
- restore plain SQL dump: `psql`

The application now also exposes admin-only export tools under `Administration > Data Model`:
- portable JSON export
- full JSON export
- PostgreSQL dump download

AI administration now lives under `Administration > Configurations`:
- global AI enable/disable
- active provider selection
- provider configuration and connection testing
- optional active-provider visibility to end users

If the PostgreSQL dump button is disabled, the backend could not execute `pg_dump`.
Typical fixes:
- install PostgreSQL client tools on the backend machine
- add `pg_dump` to the system `PATH`
- set `PG_DUMP_PATH` in the root `.env` to the full executable path

## Recommended Practice

- Use Prisma schema changes instead of manual table edits.
- Keep root `.env` accurate before running Prisma commands.
- Use `npm run db:push` after schema changes.
- Use `npm run db:seed` only when you need demo/reference data.
- Stop running backend processes on Windows if Prisma client generation hits a file lock issue.
- Set `AI_CONFIG_ENCRYPTION_KEY` before storing provider API keys through the admin UI.
