# Skill Set Blueprint

The output contract for Phase 5. Write skills into the repo's existing skill directory when one exists (`.claude/skills/`, `.agents/skills/`); default to `.claude/skills/`. Lowercase kebab-case, directory name equal to frontmatter `name`.

## The skill layer

The goal is a robust skill layer: enough skills that any code task in the repo is covered by the base skill plus one or two narrow ones, so the codebase stays standardized no matter which session touches it. Four families, named by role:

1. **`architecture`** (always; exactly this name): the single base skill. Target-state placement and dependency guide: the architectural model as an ASCII diagram, project vocabulary, full folder structure, dependency direction, cross-module rules with the concrete module DAG, ownership/placement tables, and a checklist that delegates to every narrower skill. It must pin down code topology explicitly: the **module template** (the exact internal tree every module converges to, stating which folders are mandatory and which appear only when the role exists), a **one-home rule per file kind** (where types, enums, DTOs, helpers each live — exactly one answer per kind, as the interview decided), and a **representation table** mapping each building-block role to its one construct (e.g. DTO = type, enum = const object with merged type, adapter = class) so the same concept is never expressed two ways.
2. **`*-styleguide`** (one per architectural layer that has real rules): `coding-styleguide` always (language expression and naming — a tie-breaker, not a refactor license); then one per layer the diagnosis found, named in the project's vocabulary — e.g. `jsx-styleguide` (view), `service-styleguide` (application/state layer plus its ports, adapters, DI, mocks), `domain-styleguide` (entities, invariants, mutation and identity rules; only when a real domain layer exists).
3. **`*-architecture`** (one per recurring surface pattern): forms, tables, charts, API routes, jobs — a cooperating-layers pattern that repeats across features. Generate one only with real mass: roughly three or more existing instances and the expectation of more. A one-instance surface gets a paragraph in `architecture` instead.
4. **Workflow skills** (as the repo warrants, offer them): a porting/migration skill when a legacy sibling codebase is the source of truth for behavior; a design-handoff skill when designs drive UI work; a `code-review` skill that checks diffs against the rest of the set.

Skills own disjoint territory and say so. Each body states what it owns and where the rest lives ("Architecture vocabulary and file placement come from `architecture`; service mechanics from `service-styleguide`. This skill owns code expression and naming."). Never duplicate a rule into two skills — link to the owner.

## The description formula

The description is all a fresh agent sees before loading. Compose it from these parts, in order:

1. **Trigger clause**: "Always load when creating, editing, reviewing, refactoring, or testing <enumerated concrete surfaces> in <Project>." Use "Always load" for standards skills — they are not optional reading. Name the project so triggering stays scoped to this repo. Enumerate surfaces concretely: "tables, data grids, record lists, columns, sorting, search, selection, pinning, loading or empty states, row actions, or entity-to-row mapping".
2. **Indirect triggers**: "Load it even when the request only says to add a field, validate an input, or build a screen with editable values." This line does most of the real-world triggering — never omit it on `*-architecture` and layer styleguides.
3. **Composition line**: "Use alongside <siblings>." — e.g. "Use alongside architecture, coding-styleguide, and jsx-styleguide, plus domain-styleguide when services mutate entities." The descriptions collectively declare the skill dependency graph, so loading one skill pulls in the right companions.
4. **Non-triggers** when a near-miss exists: "Do not load for ordinary new features or target-only refactors with no legacy behavior in scope."

## Body conventions

Imperative voice throughout. Anatomy, in order (drop sections a skill genuinely doesn't need):

1. **Authority / Core model**: one section stating what this skill is canonical for, the pattern's cooperating pieces, and — in the base skill — the architecture as an ASCII layer diagram with arrows.
2. **Project vocabulary**: define the ubiquitous language once, mapping project terms to canonical patterns ("**Service**: a Zustand state/action contract — the ViewModel boundary. **Repository**: a typed port plus adapter for backend data."). Every other skill then uses these words without redefining them. The vocabulary comes out of the diagnosis and interview.
3. **File layout / placement**: real trees in `text` blocks with per-line notes, plus **decision tables** for placement judgment calls (helper scope → destination). Tables beat prose for "where does this go" questions.
4. **The pattern, with the canonical recipe**: each cooperating piece gets a code excerpt **copied from the repo (lightly genericized), never invented** — invented code teaches the wrong dialect. For each recurring workflow, bless exactly one real implementation as *the* reference to copy, and say so: "The working <X> reference is: …". One copyable recipe outperforms three near-duplicates.
5. **Anti-drift rules**: the highest-value content. For every place an agent would plausibly "improve" the architecture, write an explicit "Do not add X" naming the machinery: facades, event buses, scoped stores, a second store, generic frameworks, snapshot/codec layers, normalization passes, `readonly` ceremony, wrapper classes for stylistic consistency. Source them from the interview (every variant the user rejected becomes a prohibition) and from the pattern's natural over-engineering direction. Each prohibition carries its reason in the same sentence — a bare "don't" gets re-litigated by the next agent; a reasoned one doesn't. Include scope-limiters for deliberate imperfections: "the two arrays stay separate because their lifecycles differ — this is not a normalization project."
6. **Legacy markers**: where the interview left drift in code, name the losing variant: "N files still do X — do not copy them; new code follows this skill", pointing at one example so it's recognizable.
7. **Tests**: what a correct implementation of this pattern tests, as a bullet list. Standards without test expectations drift first.
8. **Checklist**: ordered steps; second-to-last item delegates to sibling skills ("Follow `form-architecture` and `jsx-styleguide` for their affected areas"), last item runs the repo's verify commands (typecheck, test, lint — whatever the repo actually uses).

## Sizing and independence

- 150–450 lines per SKILL.md. Beyond that, split detail into the skill's own `references/` or `rules/` files linked directly from the body.
- Vendored third-party skills (a library's official skill) may keep their own naming and structure; integrate them via the composition lines of your generated skills instead of rewriting them.
- Skills must not depend on conversation context, machine-specific paths, or this diagnosis session — a fresh agent with only the repo and the skill set must succeed.

## Skeletal example

```markdown
---
name: form-architecture
description: "Always load when creating, editing, reviewing, refactoring, or testing forms, dialogs with inputs, validation schemas, submit handling, default values, edit hydration, or form-data-to-DTO conversion in <Project>. Load it even when the request only says to add a field or validate an input. Use alongside architecture, coding-styleguide, and jsx-styleguide."
---

# Form Architecture

## Core model
Forms are built from three cooperating layers, one job each …
## File layout
​```text
src/modules/<module>/forms/<Name>Form.ts   # definition object
​```
## The form definition object
The working reference is <real excerpt from the repo> …
## Anti-drift rules
Do not add a form facade or context layer between the screen and <lib>; the definition object already owns …
## Legacy markers
4 forms under src/legacy/ still use manual onChange — do not copy.
## Tests
- schema rejects …, defaults hydrate from …
## Checklist
1. … n-1. Follow `jsx-styleguide` for the rendered fields. n. Run <verify commands>.
```

## After generating

Validate each skill: frontmatter parses, `name` matches the directory, every cited file path exists in the repo, every "Use alongside" sibling exists, every linked reference file exists. Then tell the user what was generated, one line per skill, and remind them the set is living documentation — future architecture decisions should update these files, and this skill can be re-run to re-audit drift.
