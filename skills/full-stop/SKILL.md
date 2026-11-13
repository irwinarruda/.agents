---
name: full-stop
description: >-
  Use only when the user asks for it by name at the start of a task: "full
  stop", "/full-stop", "full-stop this". The same run as full-send (builds it
  on a branch, tests it locally, opens a PR) but it ends with "babysit review"
  and no merge: a fresh subagent posts a code review, what holds up gets fixed,
  and the PR stops at ready to merge for the user. Not for a PR that already
  exists (use babysit).
---

# Full Stop

## Arguments

$ARGUMENTS

Load the `full-send` skill with these arguments, or read `../full-send/SKILL.md` next to this file, and run its workflow as the `full-stop` variant: the last step is `babysit review`, never with `full`. Never merge the PR; the user merges it.
