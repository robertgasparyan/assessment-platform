# Assessment Platform v1.0 Features

This file is the high-level feature inventory for the current `v1.0` release baseline.

## Core Product Areas

- `Dashboard`
- `Assessments`
- `Templates`
- `Reports`
- `Teams`
- `Libraries`

## Authentication

- Single-admin login flow
- Logout flow
- Password change flow for the current admin
- Clean login screen without visible default credentials in the UI
- Profile menu in the app shell for password change and logout
- Default seeded admin account:
  - username `admin`
  - password `admin`

## Dashboard

- Summary cards for operational visibility
- Quick links for:
  - create assessment
  - active assessments
  - submitted assessments
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
- Separate tabs for:
  - `Author`
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
- Team data separated from content libraries

## Assessments

- `Create`, `Active`, and `Submitted` tabs
- Create-run flow with:
  - template selection
  - team selection
  - optional owner
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
- Submission summary note
- Submitted runs become read-only

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
- Metadata strip for submitted context
- No fake persisted recommendations or action plans in v1.0

## Reports

- Reporting workspace for cross-team analysis
- `Latest per team` view
- `Latest per team + assessment` view
- Organization-level summary cards
- Filters for:
  - team
  - template
  - category
  - domain
  - question
- Score-by-team chart
- Domain snapshot across latest submitted state
- Question snapshot when a question filter is active
- Current-state table with strongest and weakest domain context

## Persistence and Governance

- PostgreSQL + Prisma persistence model
- Root `.env` as single source of truth
- `AdminUser` persistence for login/session handling
- Template usage guard for deletion
- Library usage counts for governance visibility
- Assessment run metadata persistence for:
  - owner name
  - due date
  - submission summary

## Installation and Operations

- OS-specific setup guides:
  - [Windows](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_WINDOWS.md)
  - [Linux](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_LINUX.md)
  - [macOS](/C:/Users/Robert%20Gasparyan/Documents/Development/assessment-platform/INSTALLATION_MACOS.md)
- Database export/import instructions included in installation docs

## Release Baseline

Treat the current repository state as `Assessment Platform v1.0`.
