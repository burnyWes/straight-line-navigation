---
name: commit-skill
description: Create a git commit in this repo. Use when the user asks to "commit", "make a commit", or invokes "/commit-skill". Enforces the "COE-xxx > type: subject" message format with a "(committed by agent)" footer, auto-stages all changes (always including docs/notes.txt), and refuses to commit unless all backend and frontend tests pass.
---

# Commit Skill

Create a git commit that follows this repository's rules. **Never** commit if any test
fails.

## Hard rules

1. **Project message format only.** Subject is `COE-xxx > type: subject`, where
   `COE-xxx` is the story number and `type` follows conventional commits. Omit the
   `COE-xxx > ` prefix only when the commit belongs to no story (see *Story number*).
2. **Agent footer required.** Every commit message ends with a `(committed by agent)`
   footer line.
3. **Green tests only.** Run all backend and frontend tests first. If anything is red,
   **stop, report the failing output, and do not commit.**
4. **Auto-stage.** Stage all relevant changes with `git add -A` before committing. This
   always includes `docs/notes.txt` whenever it has changes — never leave notes.txt
   modifications out of the commit.

## Message format

```
COE-xxx > type: subject

optional body explaining what and why

(committed by agent)
```

- **COE-xxx** — the story number (e.g. `COE-007`), followed by ` > `. See *Story
  number* below for how to obtain it. Drop this prefix entirely (start the subject at
  `type:`) when the commit belongs to no story.
- **type** — one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, `revert`.
- **subject** — imperative mood, lower-case, no trailing period, ideally ≤ 72 chars.
- **body** — optional; explain the *why* when it is not obvious.
- **footer** — `(committed by agent)` on its own line, after a blank line. Always
  present.

Example (with story):

```
COE-007 > feat: add reset button to controls

Adds a reset control that clears the board and restarts the simulation.

(committed by agent)
```

Example (no story — ad-hoc change with no associated plan):

```
fix: correct typo in start menu label

(committed by agent)
```

## Story number

- The story number lives in the `story:` frontmatter field of the plan being
  implemented (plans are created by `rpi-plan` with a sequential `COE-xxx` story
  number). When committing work for a plan, read `story:` from that plan's frontmatter
  in `docs/agents/plans/` and use it as the `COE-xxx` prefix.
- If the change belongs to no plan/story (e.g. an ad-hoc fix), omit the `COE-xxx > `
  prefix and start the subject directly at `type:`.

## Test gate

This is a frontend-only TypeScript project (Vite + Vitest, no backend — see
`docs/design.md`). Run the following before committing. It must succeed.

```powershell
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

Skip a step only when the corresponding script does not exist yet in
`package.json` — never because it is inconvenient.

**If either step fails:** stop immediately, show the relevant failing output to the
user, and do **not** create a commit.

## Workflow

1. **Review changes.** Run `git status` and `git diff` to understand what changed and
   choose an accurate conventional `type` and subject.
2. **Determine the story number.** Read `story:` from the frontmatter of the plan being
   implemented (under `docs/agents/plans/`). If the change belongs to no plan/story,
   there is no prefix.
3. **Auto-stage.** Run `git add -A` to stage all changes (always including
   `docs/notes.txt` if modified).
4. **Run the typecheck.** `npm run typecheck`.
5. **Run the tests.** `npm test`.
6. **Gate.** If any run failed → stop, report the failure, do not commit.
7. **Compose the message** as `COE-xxx > type: subject` (or `type: subject` without a
   story) with the `(committed by agent)` footer.
8. **Commit.** Create the commit. Confirm success with `git log -1 --stat`.

## Notes

- All commands are run from the repo root unless noted (`cd frontend` for the frontend
  build, then return with `cd ..`).
- Do not bypass hooks (`--no-verify`) or skip the test gate, even if the user is in a
  hurry — a red build means no commit.
