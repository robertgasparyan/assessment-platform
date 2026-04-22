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

Detailed PM2 and systemd examples are included below.

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

## PM2 Deployment

PM2 is a simple production process manager for Node.js apps. It is useful when you want automatic restarts, log management, and simple startup registration without writing a systemd unit manually.

### 1. Install PM2

```bash
sudo npm install -g pm2
```

### 2. Pull or copy the project

Example path:

```bash
sudo mkdir -p /opt/assessment-platform
sudo chown -R "$USER":"$USER" /opt/assessment-platform
cd /opt/assessment-platform
git pull
```

If this is a first deployment, clone the repository into `/opt/assessment-platform` instead of running `git pull`.

### 3. Configure environment

Create or update the root `.env` file:

```bash
nano .env
```

Minimum production values:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/assessment_platform?schema=public"
PORT=4000
CLIENT_URL="https://app.example.com"
PG_DUMP_PATH="/usr/bin/pg_dump"
AI_CONFIG_ENCRYPTION_KEY="replace-with-a-long-random-secret"
```

For the frontend build, set `VITE_API_URL` before building if the frontend calls a separate API domain:

```bash
export VITE_API_URL="https://api.example.com/api"
```

If the backend is proxied under the same domain at `/api`, use:

```bash
export VITE_API_URL="/api"
```

### 4. Install, sync database, and build

```bash
npm install
npm run db:push
npm run build
```

Seed only when needed:

```bash
npm run db:seed
```

Do not run seed on a production database unless you intentionally want the seeded starter/demo data.

### 5. Start backend with PM2

From the project root:

```bash
pm2 start "npm --workspace backend run start" --name assessment-platform-api
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs assessment-platform-api
pm2 restart assessment-platform-api
pm2 stop assessment-platform-api
pm2 delete assessment-platform-api
```

### 6. Register PM2 startup

Generate the startup command:

```bash
pm2 startup
```

PM2 prints a command beginning with `sudo env ...`. Copy and run that printed command.

Save the current PM2 process list:

```bash
pm2 save
```

After this, PM2 should restore `assessment-platform-api` after server reboot.

### 7. Update an existing PM2 deployment

```bash
cd /opt/assessment-platform
git pull
npm install
npm run db:push
npm run build
pm2 restart assessment-platform-api
pm2 save
```

### 8. Serve frontend with Nginx

Example Nginx server for a separate frontend domain:

```nginx
server {
    listen 80;
    server_name app.example.com;

    root /opt/assessment-platform/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Example Nginx server for a separate API domain:

```nginx
server {
    listen 80;
    server_name api.example.com;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## systemd Deployment

systemd is the standard Linux service manager. It is a good choice when you want the backend managed as a native OS service.

### 1. Prepare project directory

Example path:

```bash
sudo mkdir -p /opt/assessment-platform
sudo chown -R "$USER":"$USER" /opt/assessment-platform
cd /opt/assessment-platform
git pull
```

If this is a first deployment, clone the repository into `/opt/assessment-platform`.

### 2. Configure environment

Create or update the root `.env` file:

```bash
nano /opt/assessment-platform/.env
```

Minimum production values:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/assessment_platform?schema=public"
PORT=4000
CLIENT_URL="https://app.example.com"
PG_DUMP_PATH="/usr/bin/pg_dump"
AI_CONFIG_ENCRYPTION_KEY="replace-with-a-long-random-secret"
```

The backend loads the root `.env` at runtime through `backend/src/env.ts`, so the systemd service should run from the repository root.

### 3. Install, sync database, and build

```bash
cd /opt/assessment-platform
npm install
npm run db:push
npm run build
```

### 4. Create a service user

Using a dedicated user is cleaner than running the app as `root`.

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin assessment-platform
sudo chown -R assessment-platform:assessment-platform /opt/assessment-platform
```

If your deployment process uses your normal SSH user for `git pull` and builds, you can keep ownership with that user and set `User=` accordingly in the unit file. The important rule is that the service user must be able to read the project files and root `.env`.

### 5. Create the systemd unit

Create:

```bash
sudo nano /etc/systemd/system/assessment-platform-api.service
```

Example service:

```ini
[Unit]
Description=Assessment Platform API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/assessment-platform
ExecStart=/usr/bin/npm --workspace backend run start
Restart=always
RestartSec=5
User=assessment-platform
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Confirm the `npm` path:

```bash
which npm
```

If `which npm` returns a different path, update `ExecStart`.

### 6. Enable and start the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable assessment-platform-api
sudo systemctl start assessment-platform-api
```

Check status and logs:

```bash
sudo systemctl status assessment-platform-api
sudo journalctl -u assessment-platform-api -f
```

Restart after changes:

```bash
sudo systemctl restart assessment-platform-api
```

Stop the service:

```bash
sudo systemctl stop assessment-platform-api
```

### 7. Update an existing systemd deployment

If the service user owns the project:

```bash
sudo systemctl stop assessment-platform-api
cd /opt/assessment-platform
sudo -u assessment-platform git pull
sudo -u assessment-platform npm install
sudo -u assessment-platform npm run db:push
sudo -u assessment-platform npm run build
sudo systemctl start assessment-platform-api
```

If your SSH user owns the project and the service only runs it:

```bash
sudo systemctl stop assessment-platform-api
cd /opt/assessment-platform
git pull
npm install
npm run db:push
npm run build
sudo systemctl start assessment-platform-api
```

### 8. Serve frontend with Nginx

Use the same Nginx pattern as PM2. The backend process manager changes, but the frontend remains static files from:

```text
/opt/assessment-platform/frontend/dist
```

Example same-domain setup with API proxied under `/api`:

```nginx
server {
    listen 80;
    server_name app.example.com;

    root /opt/assessment-platform/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Choosing PM2 or systemd

- Use PM2 if you want the fastest Node-oriented setup with simple logs and restart commands.
- Use systemd if you prefer native Linux service management and operating-system-level service control.
- Do not run both PM2 and systemd for the same backend process at the same time.

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
