# Changelog

All notable changes to this project should be documented in this file.

## Unreleased

- Added the first broader participant-model foundation with assessment targets, response modes, internal run participants, participant response storage, and participant-management API primitives.
- Added internal participant response workflow with My Assessments visibility, a dedicated individual answering page, participant autosave, participant submission, and manager progress counts.
- Added manager-controlled aggregation for individual participant responses into final submitted team-level results.
- Added reusable external contacts for guest assessment links, email invitation actions for internal and guest participants, and a group-level Reports snapshot.
- Added an administration external-contact directory plus email delivery history/status tracking for participant invites, guest invites, and submitted-report emails.
- Added external individual participant links so outside contacts can complete individual responses without platform accounts and still feed participant aggregation.
- Added external participant invite lifecycle controls, participant reminder emails, result action-plan items, and admin security hygiene metrics/actions.
- Added bulk participant reminders and latest participant email delivery status on the assessment run page.
- Added bulk participant invites, per-participant email history, external participant link expiry editing, safe pre-response participant removal, and external contact profile pages.
- Added participant search/status filters, bulk pending external-link copy, assessment run copy-to-draft, ready-for-review draft governance, filtered audit CSV export, and active external-link security visibility.
- Enhanced Results AI into a report deep-dive experience with prompt shortcuts, report-scoped Q&A, supporting points, and source labels.
- Added chat-based AI template creation with clarifying questions, generated draft preview, save-draft action, and authoring-studio handoff.
- Split chat-based AI template creation into a dedicated `AI Chat` tab and upgraded AI Template Reviewer with readiness score, risk level, blockers, domain-balance notes, and maturity-scale notes.
- Added AI aggregation insight for individual participant response runs, including disagreement level, high-variance questions, comment themes, facilitator questions, and aggregation readiness.
- Preserved existing shared team-level assessment behavior as the default run mode.

## v1.0.0

Initial `Assessment Platform v1.0` release baseline.

### Included

- User management with roles, team membership, login, logout, password change, forced password change, admin password reset, and activation-link onboarding
- Dashboard with lightweight operational overview
- Assessment run management with create, active, submitted, and archived workflows, assigned owners, assignment history, dedicated My Assessments view, and role-aware access
- Template authoring with drafts, versioning, reusable domains, reusable questions, and managed categories
- Admin-controlled AI configuration with global enable/disable, provider selection, encrypted provider-secret storage, and provider connection testing
- Libraries area for categories, domains, and questions
- Teams management with optional team groups, group metrics, team profile pages, membership management, compact/card directory views, search/filtering, and create-assessment shortcuts
- Results experience with overview, compare, peers, print summary, chart-based drilldown, read-only share links, CSV export, and optional cached AI Brief generation for submitted runs
- Admin-controlled SMTP-backed email sending for submitted reports from the Results page
- Reports area for latest submitted state across teams and across `team + assessment`, plus CSV export and optional cached AI Brief generation for the current filtered reporting lens
- Templates AI assist for question improvement, domain refinement, draft consistency review, guided AI Builder flow, and one-shot full AI draft generation into the authoring studio
- Admin audit trail and in-app notifications, including team, team group, and team membership audit coverage
- Administration Data Model relationship maps with compact and visual schema orientation
- Admin export tools for portable/full JSON export plus PostgreSQL dump download
- PostgreSQL + Prisma persistence model
- Installation and database documentation
- v2 roadmap documentation for broader participant/target modeling, external collaboration, group reporting, action planning, stronger auth, notification upgrades, AI assistant maturity, and import/export maturity
