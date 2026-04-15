# Deployment Guide

This guide explains how to deploy Assessment Platform `v1.0` to a live environment.

## Recommended Production Shape

- PostgreSQL database
- Backend: Node.js/Express API
- Frontend: Vite-built static assets served by Nginx, Apache, or another static host
- Reverse proxy in front of the backend

## Required Environment Variables

Root `.env`:

```env
DATABASE_URL="postgresql://user:password@host:5432/assessment_platform?schema=public"
PORT=4000
CLIENT_URL="https://your-frontend-domain.example.com"
PG_DUMP_PATH="/usr/bin/pg_dump"
AI_CONFIG_ENCRYPTION_KEY="replace-with-a-long-random-secret"
OLLAMA_BASE_URL="http://192.168.1.1:11434"
OLLAMA_MODEL="gpt-oss:20b"
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL=""
OPENAI_API_KEY=""
CLAUDE_BASE_URL="https://api.anthropic.com"
CLAUDE_MODEL=""
CLAUDE_API_KEY=""
GEMINI_BASE_URL="https://generativelanguage.googleapis.com/v1beta"
GEMINI_MODEL=""
GEMINI_API_KEY=""
```

Frontend environment:

```env
VITE_API_URL="https://your-api-domain.example.com/api"
```

## Deployment Steps

### 1. Provision PostgreSQL

- Create an empty PostgreSQL database
- Confirm the production `DATABASE_URL`

### 2. Install dependencies

```bash
npm install
```

### 3. Apply schema

```bash
npm run db:push
```

### 4. Seed data if needed

```bash
npm run db:seed
```

Use seed data only if you want demo/reference content in the target environment.

### 5. Build the app

```bash
npm run build
```

### 6. Start the backend

Example:

```bash
npm --workspace backend run start
```

In production, use a process manager such as:
- PM2
- systemd
- Docker orchestration

### 7. Serve the frontend

Build output:
- `frontend/dist`

Serve that directory from your web server or static hosting platform.

### 8. Configure reverse proxy

Typical routing:
- frontend app: `https://app.example.com`
- backend API: `https://api.example.com`

Or:
- frontend app: `https://app.example.com`
- backend API proxied under `/api`

## Verification Checklist

- frontend loads successfully
- backend health/API endpoints respond
- database connection works
- templates load
- assessments can be created
- reports page loads submitted data
- AI configuration page loads
- provider connection testing works for the configured provider
- AI-enabled Results, Reports, and Templates surfaces behave as expected

## Suggested Production Concerns

- HTTPS
- regular PostgreSQL backups
- install PostgreSQL client tools if you want the in-app PostgreSQL dump download to work
- set `PG_DUMP_PATH` explicitly when `pg_dump` is not on the backend process `PATH`
- set `AI_CONFIG_ENCRYPTION_KEY` before storing provider secrets through the admin UI
- if using Ollama in production, verify backend network access to the configured base URL
- if using hosted providers, verify outbound network access and secret management
- log collection
- process restart policy
- environment-specific `.env` management

## Related Docs

- [README.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/README.md)
- [DATABASE.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/DATABASE.md)
- [INSTALLATION.md](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION.md)
