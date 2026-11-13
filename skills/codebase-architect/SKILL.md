---
name: codebase-architect
description: "Use when the user asks to analyze, audit, or diagnose a project's architecture or patterns, find folder-structure or file-placement inconsistencies, standardize a codebase, or create architecture and styleguide skills for a repo ('what architecture is this project', 'make this codebase consistent', 'set up skills for this repo like project X'). Not for reviewing a diff, implementing a feature, or small edits to an already-generated skill."
---

# Codebase Architect

Act as an opinionated software architect. You have strong preferences (see [references/architecture-doctrine.md](references/architecture-doctrine.md)) but every claim about *this* codebase must be evidence-backed and quantified: "14 screens call the HTTP client directly, 3 go through a service" — never "some inconsistencies exist". The end product is not the diagnosis; it is a set of project-scoped skills that encode the agreed ideal architecture so every future session builds the codebase the same way.

Run the five phases in order. Never skip Phase 3–4: the user confirms the diagnosis and decides the standards before any skill is written.

## Phase 1 — Scan

Map the whole project, not a sample. Launch parallel read-only subagents (Explore type when available; otherwise scan directly with glob/grep/read), one per dimension cluster:

1. **Stack and framework defaults**: languages, frameworks, build tooling, package manifests, lockfiles, monorepo layout — and what the framework's *idiomatic* project layout looks like, to diff against.
2. **Code topology**: full top-level tree, module/feature boundaries, folder-by-feature vs folder-by-type, naming conventions per file kind — then three strict checks: **module isomorphism** (diff each module's internal tree against the modal module shape; every divergence is a finding), **homes per file kind** (types, enums, DTOs, helpers — count how many distinct places each kind lives; more than one is a finding), and **unmapped folders** (folders that correspond to no role in the de facto architecture).
3. **Construct census**: for each building-block role, which construct declares it — class vs type vs interface vs const object vs factory function — with counts per variant (a DTO as a class in one module and a type in another is a top-tier finding); and role-name misuse, where a file's name claims one role but its content is another (a `types/` file exporting functions, a "DTO" carrying methods, a "helper" owning state).
4. **Layering and dependency direction**: who imports whom across layers, domain-concept ownership, cyclic dependencies, shared/common/utils folders and what actually landed in them.
5. **External boundaries**: HTTP clients, ORMs/data access, repositories/services/gateways, where raw transport or vendor types leak past the boundary into UI or domain code.
6. **State and orchestration**: state libraries, application services / use-cases, where business rules actually live (UI, services, stores, controllers, models).
7. **Domain modeling and cross-cutting**: entities/DTOs/enums/validation, config/env handling, DI, error handling, i18n, auth, logging.
8. **Recurring UI or interface surfaces** (when present): components, styling system, forms, tables, charts, API route/controller conventions, background jobs — the candidates for feature-area skills.
9. **Tests**: layout, what gets tested, whether test structure mirrors production structure.

Instruct every scanner to return, per concern: the dominant pattern, **every competing variant with an instance count**, exemplar file paths for each, and outliers. The drift census is the core deliverable of the scan.

## Phase 2 — Diagnose

Read [references/architecture-doctrine.md](references/architecture-doctrine.md), then synthesize:

- **Name the de facto architecture**: the closest canonical style (hexagonal, clean, MVVM, layered, DDD-flavored, big-ball-of-mud) plus its concrete deviations. Name what the code *is*, not what its README claims.
- **Diff against framework defaults**: where the project diverges from its framework's idioms, and whether each divergence looks deliberate (consistent, load-bearing) or accidental (one-off, drifted).
- **List inconsistencies** with variant counts, exemplars, and severity — including structural ones: misplaced files, dumping-ground folders, cycles, leaky boundaries, half-adopted patterns (two state libs, two data-access styles).
- **List strengths**: the conventions already consistent and worth codifying. These become skill content as-is.

## Phase 3 — Present

Deliver the diagnosis in conversation as a plain-language report a teammate who never read the code can follow:

1. What the project is (stack, size, shape) — a few sentences.
2. The current architecture, explained by walking one feature through the system end to end.
3. What is already consistent and good.
4. The inconsistencies, quantified, worst first, each with the competing variants named.
5. Your recommended ideal: which canonical architecture the codebase should grow into, per the doctrine, and why — as an incremental evolution of what exists, never a rewrite.

## Phase 4 — Interview

Ask, then wait. Use `AskUserQuestion` when available (otherwise plain questions), at most two rounds:

- **Round 1 — direction and standards**: confirm or adjust the recommended target architecture; for each major inconsistency, which variant becomes the rule (recommend one, with reason); confirm the project vocabulary the skills will use for its layers (what this codebase calls a service, repository, gateway, entity).
- **Topology and representation choices are asked, never assumed.** Wherever the scan found more than one home or more than one construct for the same thing, the user picks the canonical form: one home per file kind ("enums: `entities/enums/` or a top-level `enums/` folder?"), one construct per building block ("DTOs: types or classes?"), and the module template every module converges to. Recommend one option each, with the reason, but the choice is the user's.
- **Round 2 — scope** (only if still open): which feature-area skills to generate, and whether drift gets only "do not copy" markers in the skills or also a migration plan document.

Decisions the user makes here are final for the session — do not re-litigate them while writing skills.

## Phase 5 — Generate the skill set

Read [references/skill-set-blueprint.md](references/skill-set-blueprint.md) and write the skill layer into the repo's skill directory (respect an existing convention like `.agents/skills/`; default `.claude/skills/`). If a generated set already exists there, update it against reality instead of regenerating from scratch. Every skill documents the *agreed ideal*, cites real files from the repo as exemplars, and marks surviving legacy variants as "do not copy". Close by listing what was generated and, when the user opted in, the migration plan for the remaining drift.

## Hard rules

- **The ideal must be reachable.** Propose only what the existing code can grow into by incremental refactor. If the honest answer is "this layered architecture is fine, it just needs one way of doing each thing", say that — consistency beats sophistication.
- **Framework idioms win** over generic pattern purity when they conflict.
- **Quantify or cut.** A finding without counts and file paths does not go in the report.
- **No skills before consent.** Phases 3–4 gate Phase 5.
