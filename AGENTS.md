# Agent Instructions

## Versioning Rule

- Every code change that affects behavior, UI, configuration, API shape, trading logic, deployment flow, or bug fixes must include a version bump in `package.json`.
- Use patch bumps for small fixes and routine feature work: `1.0.1` -> `1.0.2`.
- Use minor bumps for grouped feature releases or notable operator-facing changes: `1.0.2` -> `1.1.0`.
- Do not ship behavior changes without updating the version.

## Dashboard Rule

- The current application version must remain visible on the dashboard.
- If the dashboard structure changes, preserve a clearly visible version indicator.

## Config Rule

- Bootstrap/system settings that are required before database access stay in `.env`.
- Trading and strategy settings that are meant to be operator-managed belong in the database-backed config path.
