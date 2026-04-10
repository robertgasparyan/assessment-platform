# User Guide

This guide explains how an admin uses Assessment Platform `v1.0`.

## Login

The app now requires login before accessing the admin workspace.

Default seeded admin credentials:
- username: `admin`
- password: `admin`

After login, open the profile menu in the top-right of the app shell to:
- change password
- logout

## Main Navigation

- `Dashboard`
- `Assessments`
- `Templates`
- `Reports`
- `Teams`
- `Libraries`

## Dashboard

Use the Dashboard to:
- jump quickly to create, active, or submitted assessments
- see latest submitted team state
- review lightweight operational summaries

## Libraries

Use Libraries to manage reusable building blocks:
- categories
- domains
- questions

Typical workflow:
1. create categories
2. create reusable questions
3. create reusable domains from those questions

## Teams

Use Teams to:
- create teams
- edit team details
- prepare teams for assessment runs

## Templates

Use Templates to create and manage assessment templates.

### Author a template

1. Open `Templates`
2. Go to `Author`
3. Complete:
   - setup
   - compose
   - review
4. Save the draft or publish the template

### Drafts

Use `Drafts` to:
- resume unfinished template work
- continue editing before publishing

### Existing Templates

Use `Existing Templates` to:
- review published templates
- edit a template as a new version
- understand usage before attempting deletion

## Assessments

The Assessments section has three tabs.

### Create

Use `Create` to launch a new assessment run.

You can set:
- template
- team
- period
- owner
- due date

### Active

Use `Active` to:
- continue draft or in-progress runs
- archive runs
- delete draft work
- restore archived runs

### Submitted

Use `Submitted` to:
- review completed runs
- filter by date or score band
- open detailed results

## Taking an Assessment

Inside an active assessment run you can:
- select maturity levels for each question
- add comments
- rely on autosave
- manually save draft
- jump to the first unanswered question
- submit a final summary note

## Results

Each submitted run has a Results view with:
- `Overview`
- `Compare`
- `Peers`

You can use it to:
- review current state
- compare against a previous submitted run
- inspect domain and question scores
- print a compact report summary

## Reports

Use Reports for cross-team analysis.

Two key views exist:
- `Latest per team`
- `Latest per team + assessment`

Use Reports to answer:
- what is each team’s latest submitted state?
- what is the current state of a team on a specific assessment?
- what is the overall picture across teams?

## Notes

- Templates are versioned
- Submitted assessments are read-only
- Current-state reporting is based on the latest submitted assessment period, not just the last click time
- `v1.0` currently supports one admin user only
