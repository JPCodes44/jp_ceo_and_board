# Repository Agents

This repository uses a lightweight `.pi` layout for prompts, skills, and local extension logic.

## Working Rules

- Prime the agent with `.pi/prompts/prime.md` before implementation-heavy work.
- Use `.pi/prompts/review.md` for review-only tasks.
- Treat `.pi/SYSTEM.md` as the base repo contract.
- Treat `.pi/APPEND_SYSTEM.md` as project-specific additions to the base contract.
- Keep reusable automation notes in `.pi/skills/`.
- Keep policy and routing code in `.pi/extensions/`.

## Protected Content

- Do not overwrite `.pi/SYSTEM.md` without explicit approval.
- Prefer additive updates in `.pi/APPEND_SYSTEM.md` when changing agent behavior.
- Review changes to `.pi/extensions/` carefully because they affect execution policy.
