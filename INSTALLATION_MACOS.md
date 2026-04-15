# macOS Installation

This guide explains how to install the Assessment Platform on macOS, how to run it locally, how to deploy it to a live environment, and how to export/import the PostgreSQL database.

This guide assumes Homebrew is available.

## 1. Requirements

Install these first:

- Node.js 20+ and npm
- PostgreSQL 15+ or later
- Git
- macOS Terminal

## 2. Install Dependencies With Homebrew

```bash
brew install node postgresql@16 git
```

Start PostgreSQL:

```bash
brew services start postgresql@16
```

Verify:

```bash
node -v
npm -v
psql --version
```

## 3. Local Installation

### Step 1: Copy the project

```bash
git clone <your-repository-url>
cd assessment-platform
```

### Step 2: Create the database

Simple option:

```bash
createdb assessment_platform
```

If you want a dedicated DB user:

```bash
psql postgres
```

Then:

```sql
CREATE USER assessment_user WITH PASSWORD 'change_me';
ALTER DATABASE assessment_platform OWNER TO assessment_user;
```

### Step 3: Install dependencies

```bash
npm install
```

### Step 4: Create environment files

Create root `.env`:

```env
DATABASE_URL="postgresql://assessment_user:change_me@localhost:5432/assessment_platform?schema=public"
PORT=4000
CLIENT_URL="http://localhost:5173"
AI_CONFIG_ENCRYPTION_KEY="replace-with-a-long-random-secret"
OLLAMA_BASE_URL="http://192.168.1.1:11434"
OLLAMA_MODEL="gpt-oss:20b"
```

Optional:
- add hosted-provider API keys only if you plan to use `OpenAI`, `Claude`, or `Gemini`
- set `PG_DUMP_PATH` if `pg_dump` is not on the backend process `PATH`

Create `frontend/.env`:

```env
VITE_API_URL="http://localhost:4000/api"
```

### Step 5: Apply schema and seed

```bash
npm run db:push
npm run db:seed
```

### Step 6: Start the app

```bash
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`

## 4. Daily Workflow

```bash
npm run dev
```

Only after Prisma schema changes:

```bash
npm run db:push
```

## 5. Live Environment

Recommended production architecture:

- frontend static build served by Nginx, Apache, or another web server
- backend Node.js process
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

### Build and start

```bash
npm install
npm run db:push
npm run build
npm run start --workspace backend
```

Serve `frontend/dist` from your web server.

## 6. Database Export

### Custom backup

```bash
pg_dump -h localhost -U assessment_user -d assessment_platform -F c -f assessment_platform.backup
```

### Plain SQL

```bash
pg_dump -h localhost -U assessment_user -d assessment_platform -f assessment_platform.sql
```

## 7. Database Import

### Restore custom backup

```bash
pg_restore -h localhost -U assessment_user -d assessment_platform --clean --if-exists assessment_platform.backup
```

### Restore SQL dump

```bash
psql -h localhost -U assessment_user -d assessment_platform -f assessment_platform.sql
```

## 8. Verify Installation

Backend health:

```bash
curl http://localhost:4000/api/health
```

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

### PostgreSQL connection fails

Check:

- PostgreSQL service is running
- user exists
- password in `DATABASE_URL` is correct
- database exists

Test directly:

```bash
psql "postgresql://assessment_user:change_me@localhost:5432/assessment_platform"
```

### Prisma says tables do not exist

Run:

```bash
npm run db:push
```

### Frontend cannot reach backend

Check:

- backend is running
- `VITE_API_URL` is correct
- `CLIENT_URL` matches frontend origin
