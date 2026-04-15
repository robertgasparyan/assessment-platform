# Backup and Restore Guide

This guide explains how to export the current `assessment_platform` PostgreSQL database and import it into another database.

It documents both supported approaches:
- full dump/restore
- plain SQL export/import

The application now also includes admin-only export tools under `Administration > Data Model`:
- portable JSON export
- full JSON export
- PostgreSQL dump download

Use the in-app export tools when you want a guided download from the running product.
Use the CLI commands in this guide when you want direct infrastructure-level control.

Related admin notes:
- `Administration > Data Model` contains the compact and visual relationship maps plus export tools.
- `Administration > Configurations` contains AI provider settings, which are part of the application state stored in the database.

## When To Use Each Approach

### Full dump/restore

Use this when you want:
- the most complete PostgreSQL-native backup format
- schema and data moved together
- a better option for restoring into another PostgreSQL database

Tools:
- `pg_dump`
- `pg_restore`

### Plain SQL export/import

Use this when you want:
- a human-readable backup file
- the ability to inspect the exported SQL
- a simpler import path with `psql`

Tools:
- `pg_dump`
- `psql`

## In-App Export Notes

### JSON export

Two JSON modes are available in the admin UI:
- `Portable JSON`
  - redacts password hashes
  - redacts active session tokens
  - redacts invite tokens
  - redacts report share tokens
- `Full JSON`
  - includes privileged backup fields
  - should be handled like a sensitive backup artifact

### PostgreSQL dump download

The PostgreSQL dump button in the app depends on the backend being able to execute `pg_dump`.

If the button is disabled:
- install PostgreSQL client tools on the backend host
- ensure `pg_dump` is on the system `PATH`
- or set `PG_DUMP_PATH` in the root `.env` to the full executable path

Example:

```env
PG_DUMP_PATH="C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
```

## Source Database Example

Current local database name:
- `assessment_platform`

Target example:
- `assessment_platform_new`

Adjust usernames, passwords, hostnames, and database names to your environment.

## Important Distinction

<div style="color:#c62828; font-weight:700;">
If you want to overwrite the existing database, use the existing database name itself: <code>assessment_platform</code>.
</div>

<div style="color:#c62828;">
<code>assessment_platform_new</code> is only an example for restoring into a different target database. It is not required when your goal is to replace the current database contents.
</div>

Examples:
- restore into a different database:
  - source: `assessment_platform`
  - target: `assessment_platform_new`
- overwrite the current database:
  - source: `assessment_platform`
  - target: `assessment_platform`

## Option 1: Full Dump and Restore

### 1. Export the current database

```powershell
pg_dump -h localhost -U postgres -d assessment_platform -F c -f assessment_platform.dump
```

Notes:
- `-F c` creates a custom-format dump
- this is the recommended format for PostgreSQL-to-PostgreSQL restore

### 2. Create the target database

Example in `psql`:

```sql
CREATE DATABASE assessment_platform_new;
```

### 3. Restore the dump into the target database

```powershell
pg_restore -h localhost -U postgres -d assessment_platform_new --clean --if-exists assessment_platform.dump
```

Notes:
- `--clean --if-exists` helps if the target DB already has objects that should be replaced

### Overwrite the existing `assessment_platform` database

<div style="color:#c62828; font-weight:700;">
For overwrite, the target database should be <code>assessment_platform</code>, not <code>assessment_platform_new</code>.
</div>

```powershell
pg_restore -h localhost -U postgres -d assessment_platform --clean --if-exists assessment_platform.dump
```

## Option 2: Plain SQL Export and Import

### 1. Export the current database to SQL

```powershell
pg_dump -h localhost -U postgres -d assessment_platform -F p -f assessment_platform.sql
```

Notes:
- `-F p` creates a plain SQL file
- this file can be opened and reviewed in a text editor

### 2. Create the target database

Example in `psql`:

```sql
CREATE DATABASE assessment_platform_new;
```

### 3. Import the SQL file into the target database

```powershell
psql -h localhost -U postgres -d assessment_platform_new -f assessment_platform.sql
```

### Overwrite the existing `assessment_platform` database

<div style="color:#c62828; font-weight:700;">
For overwrite, import back into <code>assessment_platform</code> itself.
</div>

```powershell
psql -h localhost -U postgres -d assessment_platform -f assessment_platform.sql
```

## Full Reset Then Restore

If you want the cleanest overwrite flow, drop and recreate the existing database first.

<div style="color:#c62828; font-weight:700;">
This replaces the current <code>assessment_platform</code> database completely.
</div>

Example in `psql`:

```sql
DROP DATABASE assessment_platform;
CREATE DATABASE assessment_platform;
```

Then restore:

```powershell
pg_restore -h localhost -U postgres -d assessment_platform assessment_platform.dump
```

## After Restoring Into Another Database

### 1. Update `.env`

Point the app to the target database:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/assessment_platform_new?schema=public"
```

### 2. Sync Prisma schema

```powershell
npm run db:push
```

This is a good safety step to ensure the restored database matches the current Prisma schema.

### 3. Do not reseed unless you actually want seed/demo data

If you restored a real dump from the source database, you usually should **not** run:

```powershell
npm run db:seed
```

because the restored database already contains the data.

### 4. Start the app

```powershell
npm run dev
```

## What Gets Moved

Both approaches move the stored application data, including:
- admin login data
- teams
- categories
- libraries
- templates and versions
- assessment runs
- assessment responses
- AI configuration stored in platform settings
- cached AI brief records used for Results and Reports

## Verification Checklist

After restore, verify:
- login works
- templates are visible
- teams are visible
- assessment runs are present
- reports load submitted data

## Recommended Practice

- use full dump/restore for PostgreSQL-to-PostgreSQL migrations
- use plain SQL only when you specifically want a readable export
- keep dump files out of Git
- verify `.gitignore` covers:
  - `*.sql`
  - `*.dump`

## Related Docs

- [DATABASE.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/DATABASE.md)
- [INSTALLATION_WINDOWS.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_WINDOWS.md)
- [INSTALLATION_LINUX.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_LINUX.md)
- [INSTALLATION_MACOS.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_MACOS.md)
