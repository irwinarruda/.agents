---
name: ui-council
description: >-
  Use when the user asks to raise an app's frontend UI and UX to a target score
  with the model council: "ui-council", "/ui-council", "make it a 9/10 on UI and
  UX", "improve the UI until the council approves". Loops: screenshot the app
  (usually through a mock-data dev command), have three models in T3 Code grade
  every module from 1 to 10 against the user's reference apps, improve the code,
  and repeat until the app scores as well as those references or the scores
  stop improving. Not for a one-off design
  opinion or a code review of a diff.
---

# UI Council

## Arguments

$ARGUMENTS

You are the orchestrator. You run the loop, make every code change, and keep the record. A council of three models grades the app from screenshots. Each judge gives every module one score from 1 to 10 for UI and UX together. The loop ends when the app reaches the bar, or when a stop condition below fires.

The bar is not simply the number the user said. The council's scale is its own: the apps the user admires are what "excellent" means on it, whatever number they got. In the first real run the user asked for a 9, the council gave the references 7.7 to 9.0, and six rounds chased a score that no reference had reached. So the bar is the lower of the user's number and the references' overall score, and `score` applies that by itself.

`${CLAUDE_SKILL_DIR}` is the directory that holds this file. The helper is `node "${CLAUDE_SKILL_DIR}/scripts/council.mjs" <command>`, always run from the project root. It prints JSON; trust it and do not redo its work by hand.

## The council

Defined in `${CLAUDE_SKILL_DIR}/council.json`; `brief` prints each judge's exact `delegate_task` target.

| Judge | T3 provider | Weight |
|---|---|---|
| `opus`: Claude Opus 5.5, effort xhigh | Personal Claude | 3 |
| `luna`: ChatGPT Luna 6, reasoning xhigh | Codex | 1 |
| `gemini`: Gemini 3.8 Flash High | Antigravity | 2 |

A module's score is the weighted mean of the judges that returned a valid verdict this round. The round passes when the overall score is at or above the bar and no module is more than 0.2 below it. That 0.2 is noise: fresh judges do not repeat themselves, and a module's score moves about that much between rounds when nothing meaningful changed. A judge that fails for any reason (no verdict, broken JSON, could not view the images) is left out of that round's average and the loop goes on; the report names it.

Judges are not equally strict: in the first real run `opus` averaged 8.2 on the same screens `gemini` gave 8.8. So `score` compares like with like. It scores the references, and re-reads earlier rounds, with exactly the judges counted this round, and a round one judge missed neither fakes a gain nor lowers the bar.

## Rules

- **Orchestrator:** this loop is long and every judgement call in it is yours, so it needs a top-tier model: Claude Opus 5.5 or stronger. On a smaller model, stop and say so.
- **Only you touch the code.** Judges give opinions and nothing else: they read the brief and images and write their verdict file. `brief` snapshots the working tree and `score` puts back any project file that changed since then, keeping the changed copies in the round's `judge-edits/`. So never edit project files yourself between `brief` and `score`; do it before `brief` or after `score`.
- **Independent judges:** each judge sees only its brief: the screenshots, the references, the rubric. Never tell a judge the threshold, earlier scores, what you changed, or what you think of it. Start a fresh `delegate_task` for every judge in every round. Never reuse a thread, and always use the default `shared` isolation, because the round files are git-ignored and a worktree would not have them.
- **No gaming:** never edit a verdict, drop a module or page, or shrink the page list to pass. Adding pages is fine. Fix mock data only to make it realistic, never to hide a layout problem: long names and empty lists exist in production too.
- **Hand-offs:** state lives on disk in `.ui-council/`. After a context compaction, re-read `config.json`, the latest round's `score.json` and `report.md`, and every `changes.md` before you continue.
- **Stop for:** a missing dev command or app that won't start, or any need beyond the code (a paid service, a secret, a production change). A failing judge is never a reason to stop.

## 1. Set up the project (first run only)

1. Install the screenshot tool once per machine. Skip this if `${CLAUDE_SKILL_DIR}/scripts/node_modules` exists:
   `cd "${CLAUDE_SKILL_DIR}/scripts" && npm install && npx playwright install chromium`
2. Git: if the working tree is dirty, stop and say so. On the default branch, create `ui-council/<yyyy-mm-dd>`. Any other branch is fine as is.
3. Run `council.mjs init`. It creates `.ui-council/config.json` from the example and keeps the whole `.ui-council/` folder out of git through the local exclude file, so linters and commits never see it. Then fill the config in:
   - `dev.command` and `dev.url`: the mock-data command (look for `dev:mock` or similar in `package.json`) and the URL it serves. If there is no mock command, stop and ask: a real backend makes runs slow and non-repeatable. If something already answers at `dev.url`, the helper reuses it instead of starting the command.
   - `pages`: read the router and list every route, grouped into `module`s, the product areas the user would name. Add `steps` for states that matter and that the mocks can reach: dialogs, drawers, empty, error and loading states. Step actions are `click`, `fill`, `hover`, `press`, `waitFor`, `wait` and `scroll`; selectors are Playwright locators. Mark each module's main screen with `"key": true`.
   - `viewports`: every shot is sent to every judge every round, so each variant multiplies the whole round. Give every page two variants that together cover each size and each theme (for example `desktop-dark` and `mobile-light`), and set `"pages": "key"` on the other variants so they are captured only on key pages. Themes and sizes change colors and layout app-wide, not per dialog, so the key pages are enough to judge them. A viewport takes `colorScheme` and `cookies` when the app needs them to switch theme or locale.
   Write step selectors by role and accessible name (`role=button[name="Transfer"]`), not by visible text that only some viewports show. Copy edits in later rounds will otherwise break the capture.
   - `references`: one entry per app the user named, with their own words about it in `notes`. A link becomes `url`. Copy screenshots they attached into `.ui-council/references/<name>/`.
   - `goal.threshold`: the number the user asked for ("a 9 on UI and UX" → `9`). The bar the loop really uses is settled after calibration, in section 2. `goal.maxRounds`: what they said, else 8.
4. Show the user the modules, their pages, the references and the goal in a short list, and get a yes before going on. Ask with the host's question tool (`AskUserQuestion` in Claude Code) so the thread shows it is waiting; a question at the end of a message looks like a finished run. The config is reused on every later run, so a wrong page map wastes every round after it. On later runs, update only `goal` and new references, then go straight on.

## 2. Calibrate the references

Run this when `.ui-council/references/score.json` is missing, when the references changed since it was written, or when `score` prints a non-empty `recalibrate`: a judge on today's council never graded the references, so its scores have nothing to be compared with.

1. If any reference has a `url`, run `council.mjs capture --references`. Look at every captured image yourself. Delete any that show a cookie wall, a login page or a blank page, and tell the user which reference needs real screenshots instead.
2. Run `council.mjs brief --references`, dispatch the council (section 4), then run `council.mjs score --references`.
3. Read `references/report.md` and write `.ui-council/references/summary.md`: the 5 to 10 principles the judges agree make these apps good, in plain words. Every later brief includes it.
4. Settle the bar and tell the user, in three lines at most: each reference's weighted score, their overall score, and the bar the loop will use. When the user's number is above the references' overall score, say it plainly, for example: "You asked for 9. The council gave Linear 8.97 and your references 8.42 overall, so the bar is 8.42: as good as the apps you picked." Then go on without waiting. If the user wants to aim above their references anyway, set `goal.capAtReferences` to `false` and tell them what the best reference scored, so they know what they are asking for.

## 3. The loop

Repeat until the round passes or a stop condition fires.

1. **Capture.** Run `council.mjs capture`. It starts the dev command, screenshots every page at its viewports into `.ui-council/rounds/NN/`, and stops the server. Check its output before any image:
   - `shotsWithErrors`: decide whether each is a real app bug (fix it now) or a capture problem (fix the config).
   - `identicalShots`: different pages that produced byte-identical images. That almost always means a redirect or a step that did nothing, so the judges would grade the wrong screen. Fix the page or the mocks.

   In round 1, fix what one look can find before the council sees anything. Hand the key-page shots to one native subagent (`Agent`, `model: "sonnet"`, `run_in_background: false`) and ask it to list plain breakage only, in at most 30 lines: overflow, cut-off or overlapping text, text too faint to read, a control hidden at one viewport, a blank or errored screen. No design opinions. Fix what it finds, commit, and capture again. In the first real run about a third of round 1's `high` issues were breakage of this kind, and three flagship judges are an expensive way to find it.

   From round 2 on, check that last round's changes landed before the council spends a round on them. Hand it to one native subagent (`Agent`, `model: "sonnet"`, `run_in_background: false`): give it the previous round's `changes.md` and this round's screenshots folder, and ask it to open only the shots of pages those changes touch and reply, per change, `landed`, `missing` or `broken` (overlap, cut-off text, a control hidden at one viewport), in at most 20 lines. The images stay in its context, not yours. Fix what is `missing` or `broken`, amend the previous round's commit, and capture again. An implementation slip caught here costs minutes; caught by the council, it costs a round.

   Then look at screenshots yourself, sparingly, since every image you open stays in your context for the whole loop. In the first round, open one per module. In later rounds, open only shots of pages whose config, steps or mock data you changed. If the capture is broken, delete that round's folder, fix the cause, and capture again. Never send a broken capture to the council.
2. **Brief.** Run `council.mjs brief`. It writes `brief.md` into the round folder and prints the judge targets.
3. **Grade.** Dispatch the council (section 4).
4. **Score.** Run `council.mjs score`. It validates every verdict, computes the weighted scores, writes `score.json` and `report.md`, and prints the pass state, the bar (`threshold`, with `moduleFloor` as the lowest a module may score), the modules below the bar (`failing`, lowest first), the best earlier round, and the history.
   - Judges in `missing` or `invalid` are already left out of the average. Note them in `changes.md` and carry on. Do not re-dispatch them, unless the round would pass without them (below).
   - `counted` is empty (no judge produced a valid verdict): dispatch the whole council once more for the same round. A round never passes without at least one verdict.
   - `judgeEdits.reverted` is not empty: a judge changed project files. They are already restored. Name the files and the judge's round in `changes.md`, and tell the user in the final report. Never copy anything back from `judge-edits/`.
   - `recalibrate` is not empty: run section 2 again, then `score` once more. The round cannot pass until every counted judge has graded the references.
   - `passed` is true with every judge counted: go to section 5.
   - `passed` is true but `missing` or `invalid` is not empty: a pass should not rest on part of the council. Dispatch only those judges once more for this round and run `score` again. If they fail again, the pass stands; say in the report which judges it rests on.
5. **Check the stop conditions.** Stop when this round reached `goal.maxRounds`, or when `score` prints `plateau: true`: the overall score did not beat the best earlier round by at least 0.2. In the first real run the gains were 0.8, 0.5 and 0.3, then the score fell for two rounds while the judges asked to undo what earlier judges had asked for. Past that point a round measures noise, not the app.

   A plateau gets one last pass and no new council round:
   - `regressed: true` (this round is 0.2 or more below the best one): the changes it graded made the app worse. They are the last commit, made at the end of the previous round, so undo them with `git revert --no-edit HEAD` and keep nothing from it.
   - Otherwise keep the changes, and undo only the ones this round's judges now call a problem. Make no other change: what is left in the report is taste.

   Run the checks, commit, and report. Stop early, too, when most of the remaining `high` and `medium` issues need a decision only the user can make (product scope, a missing integration, the design system) rather than code: list them and ask, through the question tool, instead of polishing around them.
6. **Improve.** Read `report.md` in full. Plan this round's changes:
   - Start with the failing modules, lowest first. Within each, fix `high` issues before `medium` and `low`.
   - Trust agreement. An issue several judges raise comes first. While `high` issues remain, one from `opus` alone counts too.
   - Once a round has no `high` issue left, act only on issues that two or more judges raise about the same screen. One judge's issue, `opus` included, is a candidate: take it only when you open that screenshot and see the defect yourself. In the first real run, most single-judge changes made at this stage were called a problem by the next round's judges, the same model among them.
   - Before acting on an issue, check whether an earlier round's `changes.md` made the opposite change for an earlier issue (a toolbar made one row, now called cut off). If so, judges are trading taste, not finding a defect: decide once, write the reason down, and do not flip it back and forth.
   - A wide `spread` on a score means the judges disagree. Look at those screenshots yourself and decide.
   - Keep every listed strength intact.
   - If a module scored lower than in the previous round, look at last round's changes to it first and revert the one that caused it.
   - Prefer changes that raise the whole app over one-screen patches: shared spacing, type scale, color tokens and components.

   Make the changes, following the project's own rules (`AGENTS.md`, `CLAUDE.md`, its style skills). Check in two speeds. While editing, run only the fast checks (lint, typecheck) after each batch of changes, so a break shows up next to its cause. Once the round's edits are done, run the test suites that cover what you touched (UI changes: the UI or client tests, not suites that need a database or other services) and fix what breaks. Run the full suite once, before the final report, or in any round where you changed server code. Write `.ui-council/rounds/NN/changes.md`: each change with the issue it answers, and each issue you chose not to act on, with the reason. Commit once per round, with the round number in the message, following the project's commit convention (`AGENTS.md`, `CLAUDE.md`, recent `git log`); `ui-council: round NN` only when it has none. Do not push. If you added a dependency, stop any dev server you started yourself before the next capture: a reused server can serve a stale bundle. Then start the next round.

## 4. Dispatching the council

`brief` prints each judge with an `images` mode. Use `title: "ui-council <round or calibration> <judge id>"`, `role: "review"`, the `target` exactly as printed, and `runtimeMode` when one is printed. `auto-accept-edits` lets OpenCode and Antigravity write their verdict file without asking the user for approval; the snapshot in `brief` undoes anything else they write.

**`files` judges** open the screenshots from disk. Send all of their `delegate_task` calls in one message, in parallel, with `mode: "async"` and this task:

```text
You are judge `<id>` on a UI/UX review council. Read the brief at <brief path>
and follow it exactly. Write your verdict to <verdictsDir>/<id>.json.
Do not edit any other file.
```

**`attachments` judges** (Gemini under Antigravity) cannot open image files from disk, but they see images attached to a message, at most 8 per message. Feeding them costs one tool call per image plus a send and a wait per batch, so never do it yourself: right after dispatching the `files` judges, hand it to one native subagent (`Agent`, `model: "sonnet"`, `run_in_background: false`; the `files` judges keep grading while it works). Its brief, which tells it to start the judge itself:

```text
Feed UI council judge `<id>` its images. Work from <project root>.
1. Run `node <skill dir>/scripts/council.mjs attachments<--references for calibration>`.
   It lists every image in batches of 8, each with name, file, mimeType, sizeBytes.
2. For each image call t3_attachment_prepare_upload ({type: "image", name, mimeType,
   sizeBytes}). Pipe [{"file", "relativeUrl"}, ...] for all of them into
   `node <skill dir>/scripts/council.mjs upload`. It must report no failures.
3. delegate_task with title "<title>", role "review", mode "wait", target <target JSON>,
   runtimeMode <runtimeMode as printed>,
   task: "Your task arrives in the next messages, together with images. For now,
   reply with only the word: ready".
4. Send each batch to the returned childThreadId with t3_thread_send_attachments,
   using the attachmentIds and the same names. After each send, t3_thread_wait on the
   run it returned before the next one. Every batch but the last carries:
   "Images, part <k> of <n>. Reply with only the word: received".
   The last carries this message: the line below, then the full text of the
   brief file (the "brief" path the attachments command printed):
   You are judge `<id>` on a UI/UX review council. The brief follows. The images
   it lists are attached to this conversation, each named by its path relative to
   .ui-council/. Look at them there. Do not open, search or run anything: no files,
   no commands. Your only action is writing your verdict to <verdictsDir>/<id>.json.
5. t3_thread_wait on the last run, then reply with one line: whether
   <verdictsDir>/<id>.json exists, or which step failed and why.
Do not look at the images, and do not edit any file.
```

When the feeder returns, that judge has already finished. End your turn; each `files` judge's completion wakes you. Do nothing with partial results, and do not poll. Once every judge has finished, run `score`.

## 5. Report

Lead with the result: passed in round N, or stopped and why. Then:

- **Scores:** the final weighted table, one row per module, plus the bar, and the number the user asked for when the bar was capped below it.
- **Trajectory:** one table with a row per round: the overall score and each judge's own average, from the `history` that `score` prints. A judge drifting down while the others hold is noise, and the user should be able to see it.

  Build every number in the report from the rounds' `score.json` files. Never fill a table from memory or estimates.
- **What changed:** the main changes across all rounds, grouped by theme, not by round.
- **Still open:** issues the last round raised that you didn't fix, and why.
- **Decisions:** the calls you made that shaped the result: rejected feedback, mock data you changed, pages you added.
- **Where:** the branch name and the `.ui-council/rounds/` path, so the user can browse the screenshots and verdicts.
