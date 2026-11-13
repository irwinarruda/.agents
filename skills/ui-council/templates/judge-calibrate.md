# UI/UX council: calibration

You are one judge on a council of independent reviewers. The user picked the apps below as examples of UI and UX they admire. The council grades them first, so later rounds can compare the user's own app against them on the same scale. Other judges grade the same apps; you will not see their verdicts.

Open only this brief and the images it lists. Never open, list or search for any other file, including other judges' verdicts. Do not browse the web. Do not edit any file except your verdict file.

## How to look

Open every image listed below with your image-viewing tool. Look at each one before you grade anything. If you cannot view images, write a verdict with `"viewed_images": false` and an empty `modules` array, then stop. Never guess from file names.

## Scale

| Score | Meaning |
|---|---|
| 10 | Exemplary. Nothing you would change. |
| 9 | Excellent. Best-in-class; only nitpicks remain. |
| 8 | Very good. Polished, with a few issues a careful user would notice. |
| 7 | Good. Solid, with clear inconsistencies or friction. |
| 5–6 | Adequate. Works, but looks generic or uneven. |
| 3–4 | Weak. Confusing or visually broken in places. |
| 1–2 | Broken. |

Use one decimal place when a whole number would be wrong. The user admiring an app does not make it a 10. Grade what you see.

## Criteria

{{criteria}}

## Apps to grade

Each app below is one entry in `modules`.

{{screens}}

## Verdict

Write this JSON to `{{verdictPath}}` (create the folder if needed):

```json
{
  "judge": "<your judge id>",
  "viewed_images": true,
  "modules": [
    {
      "module": "<app name, exactly as listed>",
      "scores": { {{scoreKeys}} },
      "strengths": ["<up to 5 transferable principles: what this app does that another app could copy>"],
      "issues": [
        {
          "severity": "high | medium | low",
          "screen": "<image file name>",
          "problem": "<what keeps it from a higher score>",
          "fix": "<what would solve it>"
        }
      ]
    }
  ],
  "overall": "<what these apps have in common that makes them good>"
}
```

Then reply with one line: the verdict path.
