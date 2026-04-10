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

- `AdminUser`
- `Category`
- `Team`
- `TemplateDraft`
- `QuestionLibraryItem`
- `DomainLibraryItem`
- versioned template entities
- `AssessmentRun`
- assessment responses and result-related snapshot data

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

- `AdminUser` stores the current simple admin login account.
- `sessionToken` and `sessionExpiresAt` are used for the current bearer-token session model.
- Seed data creates a default admin user with:
  - username `admin`
  - password `admin`
- The app UI no longer shows those default credentials on the login page; they are documented here and in the user/setup docs only.

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

If you also want fresh demo/reference data:

```powershell
npm run db:seed
```

## Export and Import

Detailed OS-specific instructions live in:
- [INSTALLATION_WINDOWS.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_WINDOWS.md)
- [INSTALLATION_LINUX.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_LINUX.md)
- [INSTALLATION_MACOS.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_MACOS.md)

Typical PostgreSQL tools:
- export: `pg_dump`
- restore custom dump: `pg_restore`
- restore plain SQL dump: `psql`

## Recommended Practice

- Use Prisma schema changes instead of manual table edits.
- Keep root `.env` accurate before running Prisma commands.
- Use `npm run db:push` after schema changes.
- Use `npm run db:seed` only when you need demo/reference data.
- Stop running backend processes on Windows if Prisma client generation hits a file lock issue.
