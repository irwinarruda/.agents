# UI/UX council: round {{round}}

You are one judge on a council of independent reviewers. Other judges grade the same screens. You will not see their verdicts, and they will not see yours. Grade only what a user would see on these screens.

Open only this brief and the images it lists. Never open, list or search for any other file: not the source code, not other judges' verdicts, not earlier rounds. Do not run the app or browse the web. Do not edit any file except your verdict file.

## How to look

Open every screenshot listed below with your image-viewing tool. Look at each one before you grade anything. If you cannot view images, write a verdict with `"viewed_images": false` and an empty `modules` array, then stop. Never guess from file names.

## Scale

The references below anchor the scale. The council already graded them, and each one's score is shown next to it. A screen as good as a reference earns that reference's score, whatever the number is. Do not assume the references are 9s.

| Score | Meaning |
|---|---|
| 10 | Exemplary. Nothing you would change. |
| 9 | Excellent. Best in class; only nitpicks remain. |
| 8 | Very good. Polished, with a few issues a careful user would notice. |
| 7 | Good. Solid, with clear inconsistencies or friction. |
| 5–6 | Adequate. Works, but looks generic or uneven. |
| 3–4 | Weak. Confusing or visually broken in places. |
| 1–2 | Broken. |

Use one decimal place when a whole number would be wrong. Grade each module on its own. A module scores no higher than its weakest screen allows: one broken dialog drags its module down.

Be calibrated, not kind. Every score below 10 needs at least one issue that says what keeps it from the next point.

## Criteria

{{criteria}}

## References

{{references}}

## Screens to grade

Each screen was captured at every viewport listed. Grade every module below.

{{screens}}

## Verdict

Write this JSON to `{{verdictPath}}` (create the folder if needed):

```json
{
  "judge": "<your judge id>",
  "viewed_images": true,
  "modules": [
    {
      "module": "<module name, exactly as listed>",
      "scores": { {{scoreKeys}} },
      "strengths": ["<up to 3 things that already work and must be kept>"],
      "issues": [
        {
          "severity": "high | medium | low",
          "screen": "<screenshot file name>",
          "problem": "<what a user experiences, concretely>",
          "fix": "<the specific change that would solve it>"
        }
      ]
    }
  ],
  "overall": "<two or three sentences on the app as a whole>"
}
```

List at most 8 issues per module, most important first. `high` means it costs at least a full point on its own. Then reply with one line: the verdict path.
