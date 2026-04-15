# Windows Installation

This guide explains how to install the Assessment Platform on Windows, how to run it locally, how to deploy it to a live environment, and how to export/import the PostgreSQL database.

## 1. Requirements

Install these first:

- Node.js 20+ and npm
- PostgreSQL 15+ or later
- Git
- PowerShell

Recommended:

- pgAdmin, DBeaver, or `psql`

## 2. Project Structure

This repo is a monorepo with two workspaces:

- `backend` = Express + Prisma + PostgreSQL
- `frontend` = React + Vite

Useful root scripts:

```powershell
npm run dev
npm run build
npm run db:push
npm run db:seed
```

## 3. Local Installation

### Step 1: Copy the project

```powershell
git clone <your-repository-url>
cd assessment-platform
```

### Step 2: Install dependencies

```powershell
npm install
```

### Step 3: Create the PostgreSQL database

Create a database, for example:

```sql
CREATE DATABASE assessment_platform;
```

### Step 4: Create environment files

Create root `.env` from [`.env.example`](C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/.env.example):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/assessment_platform?schema=public"
PORT=4000
CLIENT_URL="http://localhost:5173"
AI_CONFIG_ENCRYPTION_KEY="replace-with-a-long-random-secret"
OLLAMA_BASE_URL="http://192.168.1.1:11434"
OLLAMA_MODEL="gpt-oss:20b"
```

Optional:
- set `PG_DUMP_PATH` if `pg_dump.exe` is not on your `PATH`
- add hosted-provider API keys only if you plan to use `OpenAI`, `Claude`, or `Gemini`

Create `frontend/.env` from [frontend/.env.example](C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/frontend/.env.example):

```env
VITE_API_URL="http://localhost:4000/api"
```

### Step 5: Apply the Prisma schema

```powershell
npm run db:push
```

### Step 6: Seed demo data

```powershell
npm run db:seed
```

### Step 7: Start the app

```powershell
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`

## 4. Daily Workflow

Run the app:

```powershell
npm run dev
```

Only after Prisma schema changes:

```powershell
npm run db:push
```

Only if you intentionally want seed data inserted:

```powershell
npm run db:seed
```

## 5. Live Environment

Recommended production architecture:

- frontend built with Vite and served as static files
- backend running as a Node.js process
- PostgreSQL database

### Production env

Root `.env`:

```env
DATABASE_URL="postgresql://db_user:db_password@db_host:5432/assessment_platform?schema=public"
PORT=4000
CLIENT_URL="https://your-frontend-domain.com"
AI_CONFIG_ENCRYPTION_KEY="replace-with-a-long-random-secret"
```

Create `frontend/.env.production`:

```env
VITE_API_URL="https://your-api-domain.com/api"
```

### Production build

```powershell
npm install
npm run db:push
npm run build
```

### Start backend

```powershell
npm run start --workspace backend
```

### Serve frontend

Serve the contents of `frontend/dist` from IIS, Nginx, Apache, or another static file host.

Optional local preview:

```powershell
npm run preview --workspace frontend
```

## 6. Database Export

### Custom backup

```powershell
pg_dump -h localhost -U postgres -d assessment_platform -F c -f assessment_platform.backup
```

### Plain SQL

```powershell
pg_dump -h localhost -U postgres -d assessment_platform -f assessment_platform.sql
```

## 7. Database Import

### Restore custom backup

```sql
CREATE DATABASE assessment_platform;
```

```powershell
pg_restore -h localhost -U postgres -d assessment_platform --clean --if-exists assessment_platform.backup
```

### Restore SQL dump

```powershell
psql -h localhost -U postgres -d assessment_platform -f assessment_platform.sql
```

## 8. Verify Installation

Backend health check:

`http://localhost:4000/api/health`

Expected:

```json
{ "ok": true }
```

Then verify:

- Dashboard loads
- Assessments loads
- Templates loads
- Reports loads
- Administration AI configuration loads when logged in as admin

## 9. Troubleshooting

### Prisma says `DATABASE_URL` is missing

Make sure root `.env` exists and contains `DATABASE_URL`.

### Prisma says tables do not exist

Run:

```powershell
npm run db:push
```

### Frontend cannot reach backend

Check:

- backend is running
- `VITE_API_URL` is correct
- `CLIENT_URL` matches the frontend origin

### Windows Prisma DLL lock issue

If Prisma hits a file lock error on Windows:

1. stop running backend/dev processes
2. rerun:

```powershell
npm run db:push
```
