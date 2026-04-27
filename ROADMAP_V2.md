# Assessment Platform v2.0 Roadmap

This roadmap captures the planned direction after the current `v1.0` team-level assessment baseline.

## Current v1 Boundary

Version `v1.0` is intentionally centered on collaborative team-level assessment runs.

Current assessment targets are:
- teams
- optional team groups for organization and reporting context
- invited external guests participating through a run-specific guest link

Version `v1.0` does not yet model standalone internal individuals, reusable external contacts, or non-team assessment targets as first-class assessment subjects.

## Primary v2 Themes

### Broader participant and target model

The most important v2 change is expanding beyond only team-level runs.

Planned direction:
- team assessments
- group-level assessment views and assignments
- individual internal user assessments
- standalone internal participant assessments
- external participant assessments
- reusable external contacts or guest profiles

The likely design question is whether v2 introduces a generic assessment target model such as `AssessmentTarget` or `Participant`, instead of overloading `Team`.

Initial foundation now exists:
- `AssessmentTarget` models the assessment subject independently from `Team`.
- `AssessmentRun.responseMode` distinguishes shared collaborative runs from future individual/aggregated workflows.
- `AssessmentRunParticipant` and `ParticipantAssessmentResponse` prepare the data model for multiple team members answering individually before a team-level report is generated.
- External contacts can also be added as tokenized individual participants without platform accounts.
- Existing team-level runs remain compatible because `SHARED` is still the default mode.

### External and guest maturity

Guest access in v1 is functional for run-specific participation. Version 2 should mature it into a stronger external collaboration model.

Candidates:
- reusable external contacts (initial admin directory implemented)
- tokenized external individual participant links (initial implementation complete)
- stronger invite lifecycle management (initial revoke/regenerate/reminder controls implemented)
- reusable invite templates
- guest identity history across runs
- clearer external participant reporting
- email-backed guest invitations (initial send action and delivery history implemented)
- stronger revocation and expiry administration

### Group-level operations and reporting

Team groups now exist in v1. Version 2 can use them as a stronger operating and reporting dimension.

Candidates:
- group-level dashboards
- group-level latest submitted state
- group comparison reports
- group trend charts
- group-scoped assessment launch helpers
- group manager views

### Action planning after results

Version 1 deliberately avoids fake persisted recommendations or action items. Version 2 can introduce real improvement workflows.

Candidates:
- action plans linked to submitted runs
- owners (initial owner label implemented)
- due dates (initial due date implemented)
- status tracking (initial status field implemented)
- comments or updates
- follow-up assessment links
- AI-assisted draft action plans with explicit human acceptance

### Authentication and onboarding maturity

Version 1 has real login, role management, password reset by admin, and activation links. Version 2 can strengthen identity operations.

Candidates:
- email password reset
- email invitation delivery
- SSO or OIDC
- stronger session controls
- stronger session controls (initial admin hygiene metrics and expired cleanup implemented)
- better access-policy review tools
- optional organization-level security settings

### Notifications upgrade

Version 1 notifications are in-app. Version 2 can add external delivery.

Candidates:
- email notifications for assignments
- due-soon and overdue email reminders
- submitted report notifications
- guest invitation emails
- report-share emails with delivery history (initial submitted-report email tracking implemented)
- notification preferences

### Advanced AI assistant

Version 1 has an admin-controlled AI assistant and focused AI surfaces. Version 2 can make the assistant more workflow-aware.

Candidates:
- conversational template creation
- active and submitted assessment Q&A
- report Q&A
- team and group performance summaries
- guided action-plan drafting
- permissions-aware retrieval over platform data

### Import and export maturity

Version 1 already supports CSV exports, printable reports, JSON exports, PostgreSQL dumps, and readable template export. Version 2 can expand portability.

Candidates:
- template import
- portable template packs
- validation before import
- cross-environment template migration
- richer result export packages
- server-rendered PDF generation

## Data Model Preparation Notes

Avoid assuming every future assessment target is a `Team`.

Good future-proof language:
- assessment target
- participant
- subject
- respondent
- internal participant
- external participant

Current v1 code and docs can still say `team` where the feature is specifically team-level, but v2 design should avoid adding more assumptions that every assessment must be attached only to one team.

## Suggested v2 Starting Order

1. Define the participant and assessment-target model.
2. Decide how current `Team` assessment runs map into the new model.
3. Add external contact identity and invitation lifecycle.
4. Add group-level reporting and dashboards.
5. Add action-plan persistence after submitted results.
6. Add email-backed notifications and reset flows.
7. Expand AI assistant retrieval and workflow actions.
