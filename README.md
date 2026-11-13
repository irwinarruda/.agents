# Personal Agent Toolkit

Personal instructions and reusable skills for Codex and other agents that support `AGENTS.md` and Agent Skills.

The repository intentionally contains only portable instructions and scripts. Credentials, machine state, and sensitive personal context stay local through `.gitignore`.

## Contents

- `AGENTS.md` — global working and communication rules.
- `skills/babysit` — takes a PR to green: fixes CI and conflicts, and fixes only the review findings that survive an adversarial check. Stops at ready to merge; `babysit review` first has a subagent post a code review, and `babysit full` also merges once clean.
- `skills/code-review` — diff-scoped code review workflow.
- `skills/codebase-architect` — architecture diagnosis and project-scoped skill generation.
- `skills/full-send` — takes a task from nothing to merged: builds it, tests it locally, opens a PR, then runs `babysit review full`.
- `skills/full-stop` — the same run as `full-send`, ending with `babysit review` so the user merges.
- `skills/irwin-style` — coding styleguides and preferences.
- `skills/ui-council` — raises a web app's UI and UX in a loop: three models from different providers grade screenshots of every screen against reference apps you admire, and the agent improves the code until the app scores as well as they do. Needs T3 Code to reach the other models, and Playwright for the screenshots.

## Installation

Clone or copy this repository to `~/.agents`, or use it as the source for an agent configuration that reads `AGENTS.md` and discovers skills from `skills/`.

The repository scripts use standard Node.js APIs. The PR workflows (`babysit`, `full-send`, `full-stop`, and `code-review` on a pull request) also expect an authenticated GitHub CLI (`gh`).

## Local-only setup

The public examples are inert. Copy only the files needed by your local workflows.

### Optional private profile

Copy `skills/irwin-style/data/personality.example.md` to `personality.md` only if you want a local private profile. Keep that file limited to context that materially improves the agent's work.

Do not store credentials there. Treat medical, identity, family, employer, and third-party information as sensitive even when it is useful locally.

## Publishing checklist

Before pushing a change:

1. Confirm ignored private files are not staged.
2. Search the staged diff for credentials, private keys, personal identifiers, and absolute home-directory paths.
3. Validate changed scripts and exercise the affected skill on a realistic request.
4. Review the exact staged diff before committing.

## Credits

`babysit`, `full-send`, and `full-stop` follow the idea and the names of `babysit-pr`, `full-send`, and `full-stop` in [tstack](https://github.com/t3dotgg/tstack), the agent skills Theo Browne uses and published under the MIT license. The versions here are rewritten for this toolkit, but the workflow is his: one request takes a change to a merged PR with nobody watching. So are several of its rules: every review finding is fixed or dismissed with a written reason, the PR stays the size its goal needs, and the agent asks through the question tool so the thread shows it is waiting. `code-review`'s rule that a reviewer should also flag code the change does not need comes from the reviewer brief in tstack's `sol-loop`.

`ui-council` applies Theo's council idea to interfaces: models from different providers grade the same work independently, and the loop goes on until they are satisfied. He described it in a video and ships it as tstack's `council` skill; the screenshot loop, the reference calibration, and the scoring here are this toolkit's own.

## License

MIT. See [LICENSE](LICENSE).
