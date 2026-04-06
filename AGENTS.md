# AGENTS.md

## Purpose

This repository contains the production code for <project>.

## Allowed work

- Implement features in `src/`
- Add tests in `tests/`
- Update docs in `docs/`

## Protected paths

- `.github/workflows/`
- `infra/`
- `deployment/`
- `.env`
- `secrets/`
- `package-lock.json` unless explicitly requested

## Required checks before completion

- npm run lint
- npm run typecheck
- npm test

## Git rules

- Never push directly
- Never merge
- Never delete branches
- Never rewrite git history
- Never change release or CI config without explicit request

## Definition of done

A task is complete only when:

1. code is changed
2. tests or checks pass
3. a short summary of files changed is provided
