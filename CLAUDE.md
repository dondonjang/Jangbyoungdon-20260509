# CLAUDE.md

@AGENTS.md

## Claude Code Notes

- Treat `AGENTS.md` as the canonical project instruction file.
- Keep this file small; add Claude-specific workflow notes here only when they are not useful to Codex.
- Use `/memory` or `/status` in Claude Code to confirm which instruction and settings files are active.
- Prefer concise, project-specific edits over broad rewrites.
- When a task is ambiguous, first inspect the relevant files and infer from the existing TanStack Start structure before asking.
- For implementation work, preserve the same verification bar as `AGENTS.md`: at minimum `bun run build`, and `bun run lint` when TypeScript/React changed.
