# AGENTS.md

## File contracts

Some source files open with a block comment containing `## behavior` and `## constraints`. Read it before editing that file.

- If your change contradicts a constraint, stop and raise it instead of editing around it. Don't read a constraint narrowly to make a change fit.
- Leaving a task undone because it contradicts a contract is a complete result. Report it plainly.
- If your change alters behavior a header describes, update the header in the same commit.

## Skills

- `.claude/skills/` — for working **on** this repo: adding palettes, and how the rendering algorithms work. Load them before touching `src/palettes.ts`, `src/render.ts`, `src/random.ts` or `src/color.ts`.
- `skills/` — shipped **with** the package for consumers, installed via `npx mesh-gradients-init-skills`. Edit these when the public API changes.
