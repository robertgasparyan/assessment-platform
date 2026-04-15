# Roles and Permissions

This file summarizes the current practical access scope for each user role in Assessment Platform `v1.0`.

## Roles

- `ADMIN`
- `TEMPLATE_MANAGER`
- `TEAM_LEAD`
- `TEAM_MEMBER`
- `VIEWER`

## Compact Matrix

| Area | ADMIN | TEMPLATE_MANAGER | TEAM_LEAD | TEAM_MEMBER | VIEWER |
| --- | --- | --- | --- | --- | --- |
| Dashboard | yes | yes | yes | yes | yes |
| Assessments | yes | no | yes | yes | yes, submitted-focused |
| My Assessments | yes | yes | yes | yes | yes |
| Results | yes | yes, access-based | yes, access-based | yes, access-based | yes, submitted-only access |
| Reports | yes | yes | yes, team-scoped | yes, team-scoped | yes, submitted-only scope |
| Templates | yes | yes | no | no | no |
| Libraries | yes | yes | no | no | no |
| Teams | yes | no | no | no | no |
| Administration | yes | no | no | no | no |
| AI Config / Export / Audit | yes | no | no | no | no |

## Role Notes

### ADMIN

- Full platform access
- Can manage:
  - users
  - teams
  - templates
  - libraries
  - assessments
  - reports
  - administration
- Owns:
  - AI configuration
  - SMTP configuration
  - audit review
  - data model view
  - JSON export
  - PostgreSQL dump download

### TEMPLATE_MANAGER

- Can manage templates and libraries
- Can:
  - create/edit template drafts
  - publish new template versions
  - manage reusable categories, domains, and questions
  - use Templates AI and AI Builder
- Can access reporting/results surfaces when allowed by the app
- Cannot access administration, team management, or user management

### TEAM_LEAD

- Team-oriented operational role
- Can:
  - create and manage assessment runs in allowed scope
  - continue active assessments
  - review submitted results
  - use reports within their allowed scope
- Cannot manage templates, libraries, teams, or administration

### TEAM_MEMBER

- Assessment participation role
- Can:
  - access assigned or team-visible assessments within allowed scope
  - answer questions, save drafts, and submit when permitted
  - view results and reports they are allowed to access
- Cannot manage templates, libraries, teams, or administration

### VIEWER

- Read-oriented role
- Can:
  - access dashboard
  - access submitted-focused views within allowed scope
  - view results and reports for submitted data only
- Cannot manage active assessment work, templates, libraries, teams, or administration

## Important Scope Rules

- `Administration` is admin-only.
- `Templates` and `Libraries` are limited to `ADMIN` and `TEMPLATE_MANAGER`.
- `Teams` management is admin-only.
- `Reports` is role-aware, not unrestricted.
- `My Assessments` and Results access depend on assignment and team membership.
- `VIEWER` access is intentionally stricter around submitted-only data.
- If AI is disabled by admin configuration, AI features are disabled for all roles.

## Source of Truth

This document is a compact product summary.

The practical enforcement comes from:
- frontend navigation role gating
- backend route guards
- assessment/team access checks in the API
