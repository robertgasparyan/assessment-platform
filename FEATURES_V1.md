# Assessment Platform v1.0 Features

This file is the high-level feature inventory for the current `v1.0` release baseline.

## Core Product Areas

- `Dashboard`
- `Assessments`
- `Templates`
- `Reports`
- `Administration`
- `Teams`
- `Libraries`

## Authentication

- User login flow
- Logout flow
- Password change flow for the current signed-in user
- Clean login screen without visible default credentials in the UI
- Profile menu in the app shell for password change and logout
- Default seeded administrator account:
  - username `admin`
  - password `admin`
- In-app notification center in the shell

## Administration

- Dedicated `Administration` workspace
- `User Management` section
- `Configurations` section
- `Audit Trail` section
- `Data Model` section with compact and visual relationship maps
- Global AI configuration section with provider management and connection testing
- Application title configuration
- Spotlight / command-palette enable-disable setting
- Create users
- Edit users
- Activate and deactivate users
- Assign platform roles
- Assign team memberships
- Reset user passwords
- Force password change on next login
- Generate one-time activation links for onboarding
- Track last login
- Configure submitted-report email delivery
- Configure SMTP host, port, and from address
- Portable JSON export
- Full JSON export
- PostgreSQL dump download when `pg_dump` is available
- Global AI master switch
- Active provider selection:
  - `Ollama`
  - `OpenAI`
  - `Claude`
  - `Gemini`
- Provider configuration for:
  - base URL
  - model
  - API key where needed
- Provider connection test
- Optional active-provider visibility in the user shell/settings area

## Dashboard

- Summary cards for operational visibility
- Quick links for:
  - create assessment
  - active assessments
  - submitted assessments
- Spotlight search / command palette entry with keyboard shortcut support
- Compact `Latest submitted by team` section
- Lightweight search inside latest submitted team state
- Trend and recent activity context without becoming a full reporting console

## Templates

- Multi-step template authoring flow:
  - `Setup`
  - `Compose`
  - `Review`
- Draft template support
- Existing template editing through new version creation
- Published template versioning
- Slug auto-generation from template name with manual override
- Managed category selection
- Reusable domain/question composition
- Drag-and-drop domain and question ordering
- AI question improvement assist
- AI question generation from the authoring flow
- AI domain refinement assist
- AI draft consistency review
- Separate `AI Builder` tab for guided AI-assisted template creation
- One-shot full AI draft generation into the authoring studio
- Separate tabs for:
  - `Author`
  - `AI Builder`
  - `Drafts`
  - `Existing Templates`
- Usage-aware template deletion guard

## Libraries

- Managed `Categories`
- Managed `Domain library`
- Managed `Question library`
- Direct create/edit/delete flows from the Libraries page
- Duplicate actions for domains and questions
- Confirmed delete flows
- Usage counts for reusable library items
- Domains composed from reusable library questions

## Teams

- Dedicated team management area
- Team creation and editing
- Optional team groups for organizing teams by department, region, function, or program
- Team group creation, editing, and removal
- Team directory search across team names, group names, and descriptions
- Group filtering for the team directory
- Card and compact table views for the team directory
- Group summary metrics for grouped members, active runs, submitted runs, average submitted score, and latest submitted date
- Team profile pages with members, active assessments, submitted assessments, latest score, and a create-assessment shortcut
- Group profile pages with grouped team activity
- Team membership management from the team profile
- Confirmation guardrails for team, group, and membership removal
- Team data separated from content libraries

## Assessments

- `Create`, `Active`, and `Submitted` tabs
- Dedicated `My Assessments` page
- Create-run flow with:
  - template selection
  - team selection
  - optional assigned owner user
  - optional due date
  - duplicate-run detection
- Supported period types:
  - `QUARTER`
  - `CUSTOM_RANGE`
  - `POINT_IN_TIME`
- Active run operations:
  - continue
  - archive
  - delete
- Archived run restore flow
- Assignment history for owner changes
- Due-date urgency badges
- Overdue and due-state filtering
- Submitted-run date-range and score-band filtering
- Return-to-list navigation preserves context

## Assessment Taking

- Collaborative team-level response model
- Autosave draft behavior
- Manual save draft
- Jump to first unanswered question
- Domain completion visibility
- Stronger progress status with unanswered-count visibility
- Autosave status panel with last-saved feedback
- Internal submit confirmation step
- Submission summary note
- Submitted runs become read-only
- Role-aware access restrictions for templates, libraries, teams, users, and assessment operations
- Dashboard `My work` section for assigned runs and team-visible queue
- Presentation-style collaborative mode with:
  - full-screen question navigation
  - next-unanswered shortcuts
  - compact facilitator domain agenda
  - current-domain progress visibility

## Results

- `Overview`, `Compare`, and `Peers` tabs
- Executive summary
- Radar chart with wrapped long domain labels
- Interactive radar/domain linking
- Domain score bars
- Selected-domain question score bars
- Score distribution view
- Domain-over-time trend view
- Same-team comparison against selected previous submitted run
- Secondary same-period peer comparison
- Compact print-only report summary
- Optional AI Brief slide-over for submitted runs
- AI Brief copy action
- AI Brief cached summary reuse and explicit regenerate
- Submitted-data-only metadata and last-refreshed metadata
- Read-only report sharing with selectable expiry, open/copy actions, and revoke support
- Excel-friendly CSV export for both domain summary and detailed answers
- Metadata strip for submitted context
- No fake persisted recommendations or action plans in v1.0

## Reports

- Reporting workspace for cross-team analysis
- `Latest per team` view
- `Latest per team + assessment` view
- Organization-level summary cards
- Leading rows spotlight
- Needs-attention spotlight
- Filters for:
  - team
  - template
  - category
  - domain
  - question
- Active-filter chip summary
- Score-by-team chart
- Domain snapshot across latest submitted state
- Question snapshot when a question filter is active
- Current-state table with strongest and weakest domain context
- Current-state table sorting
- Inline row expansion with domain drilldown and quick question snapshot
- Excel-friendly CSV export for current rows plus domain/question snapshots
- PDF export via print
- Optional AI Brief slide-over for the current filtered reporting view
- AI Brief cache/reuse with explicit regenerate
- Submitted-data-only metadata for reporting narratives

## Audit and Notifications

- Admin audit trail page
- Audit logging for key auth, user, run, report-share, team, team-group, and team-membership events
- In-app notifications for:
  - new assignment
  - reassignment
  - submitted run visibility
  - due soon
  - overdue

## Persistence and Governance

- PostgreSQL + Prisma persistence model
- AI configuration persistence and encrypted provider-secret storage
- Root `.env` as single source of truth
- `User` persistence for login/session handling, role assignment, and team membership
- `TeamGroup` persistence for optional team categorization
- `ReportShareLink` persistence for read-only shared results access
- `AuditLog` persistence for governance history
- `Notification` persistence for user-level in-app alerts
- `AiAssessmentSummary` persistence for cached Results AI briefs
- `AiReportsBrief` persistence for cached Reports AI briefs
- Template usage guard for deletion
- Library usage counts for governance visibility
- Assessment run metadata persistence for:
  - owner user assignment and owner display name snapshot
  - due date
  - submission summary

## Installation and Operations

- OS-specific setup guides:
  - [Linux](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_LINUX.md)
  - [macOS](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_MACOS.md)
  - [Index](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION.md)
- Database export/import instructions included in installation docs
- Optional `PG_DUMP_PATH` support for backend-driven PostgreSQL dump export
- Optional AI environment defaults and `AI_CONFIG_ENCRYPTION_KEY` support for provider secrets

## Release Baseline

Treat the current repository state as `Assessment Platform v1.0`.
