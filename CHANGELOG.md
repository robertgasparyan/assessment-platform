# Changelog

All notable changes to this project should be documented in this file.

## v1.0.0

Initial `Assessment Platform v1.0` release baseline.

### Included

- User management with roles, team membership, login, logout, password change, forced password change, admin password reset, and activation-link onboarding
- Dashboard with lightweight operational overview
- Assessment run management with create, active, submitted, and archived workflows, assigned owners, assignment history, dedicated My Assessments view, and role-aware access
- Template authoring with drafts, versioning, reusable domains, reusable questions, and managed categories
- Admin-controlled AI configuration with global enable/disable, provider selection, encrypted provider-secret storage, and provider connection testing
- Libraries area for categories, domains, and questions
- Teams management
- Results experience with overview, compare, peers, print summary, chart-based drilldown, read-only share links, CSV export, and optional cached AI Brief generation for submitted runs
- Admin-controlled SMTP-backed email sending for submitted reports from the Results page
- Reports area for latest submitted state across teams and across `team + assessment`, plus CSV export and optional cached AI Brief generation for the current filtered reporting lens
- Templates AI assist for question improvement, domain refinement, draft consistency review, guided AI Builder flow, and one-shot full AI draft generation into the authoring studio
- Admin audit trail and in-app notifications
- Administration Data Model relationship maps with compact and visual schema orientation
- Admin export tools for portable/full JSON export plus PostgreSQL dump download
- PostgreSQL + Prisma persistence model
- Installation and database documentation
