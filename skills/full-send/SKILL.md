---
name: full-send
description: >-
  Use only when the user asks for it by name at the start of a task: "full
  send", "/full-send", "full-send this". Takes the task from nothing to merged:
  builds it on a branch, tests it locally, opens a PR, then runs "babysit
  review full", which has a fresh subagent post a code review, fixes what holds
  up, and merges. For the same run without the merge, use full-stop. Not for a
  PR that already exists (use babysit).
---

# Full Send

## Arguments

$ARGUMENTS

Take one task from nothing to a merged PR without stopping to check in. The user is not watching this thread, so the run only ends well if you carry it to the end yourself. The arguments are the task; when they are empty, the task is what the conversation just asked for. If there is no task, stop and say so.

`full-stop` runs this same workflow and differs only in how it ends:

- **full-send:** `babysit review full` merges the PR once it is clean.
- **full-stop:** `babysit review` stops at ready to merge, and the user merges.

When unsure which one you are running, end like `full-stop`. An unmerged PR is easy to fix; a merged one isn't.

## Rules

- Make the decisions you can make, and keep a running note of each one: what you chose, what you rejected, and why. The PR, the review brief, and the report all need it.
- Ask only when you are blocked on something the request, the code, and sensible defaults can't settle, or when the task needs something beyond the PR, such as a production change, a paid resource, or a secret you weren't given.
- Ask with the host's question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex). A question at the end of a message looks like a finished run, and the user finds it hours later; the question tool shows the thread as waiting on them. Make the question stand on its own: what blocks you, and the options with your recommendation first. With no question tool, or no answer, leave everything unmerged and lead your final message with the question.
- Never commit to the default branch. Commit in the repo's style and stage files by name.

## 1. Branch

1. If this isn't a GitHub repository, stop: everything after the build depends on `gh`.
2. If the working tree is dirty, stop. Those changes aren't yours to stash or commit, and `babysit` would stop on them later anyway.
3. On the default branch, run `git pull --ff-only` and create a branch named after the task. On another branch with no open PR, continue from it. On a branch with an open PR, stop and say so: reviewing and finishing an existing PR is `babysit review`'s job, and anything else is a separate task, not a start from nothing.

## 2. Build and test

Read the project's rules before writing code: `AGENTS.md`, `CLAUDE.md`, and the skills in the repository. Then build the smallest thing that does the task.

Run the project's tests, typecheck, and lint for what changed, then exercise the change for real: run the app, the CLI, or the endpoint and watch the new behavior happen. Passing tests only count as far as they cover the change.

Keep a note of what you ran and what happened, and of anything you couldn't exercise locally. If the change still doesn't work after three real attempts, stop and report it. Don't open a PR for something you don't believe works.

## 3. Open the PR

Commit, push with `git push -u origin HEAD`, and open the PR with `gh pr create` against the default branch, unless the user named another base. Leave the working tree clean, because `babysit` stops on a dirty one.

Open it ready for review, not as a draft: `babysit full` won't merge a draft. Use the repo's PR template if it has one. Either way, the body says what changed and why, how it was tested, and which decisions a reviewer should know about. `code-review` reads the body as the author's stated intent.

If later testing turns up a problem, fix it and push before moving on.

## 4. Babysit

Start this once the PR is open and you are satisfied with local testing. Run the babysit skill in this thread: `babysit review full <number>` for full-send, `babysit review <number>` for full-stop.

Its review step asks for the author's context, and you are the author. Fill that part of the brief from your running note: the user's request word for word, your decisions, what you verified and what you couldn't, and the riskiest parts.

From there babysit owns the PR: the posted review, the fixes, the waiting, and the merge or the handoff. Its report becomes the Review part of yours, so the user gets one report, not two.

## Report

Lead with the state: the PR link, the head commit, whether checks are green, and where it stopped: merged, queued, or ready to merge (with the reason, if full-send didn't merge). Then, skipping empty sections:

- **Built:** what changed, in a few lines.
- **Decisions:** each call that shaped the result, and why.
- **Tested:** what you ran and watched work, and what stayed unverified.
- **Review:** the assessment and the number of issues, then every section of babysit's report.
