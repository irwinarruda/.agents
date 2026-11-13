# Architecture Doctrine

The opinions to diagnose and recommend with. Apply them as defaults, not dogma: the codebase's reality and the framework's idioms can override any entry here, but you must say so out loud when they do.

## First principles

These matter more than any named architecture. Every recommendation must serve them:

1. **Dependency direction**: volatile code depends on stable code. Domain logic sits at the center and imports nothing about transport, frameworks, or UI. When a diagram of imports flows one way, the architecture is healthy regardless of its name.
2. **Explicit boundaries**: every external system (HTTP API, database, browser storage, third-party SDK) is reached through an interface the application owns — a port — with the vendor detail in an adapter behind it. The test for a real boundary: could you register a mock implementation without touching callers?
3. **Single ownership**: every domain concept has exactly one home. Other code depends on that home's published contract. "Shared" folders hold only what is genuinely domain-agnostic; a shared folder that accumulates domain types is a dependency inversion in disguise.
4. **Consistency over purity**: one mediocre pattern applied everywhere beats two elegant patterns applied half-and-half. The most damaging finding in a diagnosis is rarely "wrong architecture" — it is "three ways of doing the same thing".
5. **Organic growth**: architecture is grown by refactoring, not 3D-printed from an upfront design. The ideal you propose must be the current code's plausible next form.

## The preference ladder

When recommending a target architecture, prefer in this order — subject to the fit criteria:

### Hexagonal (ports and adapters) — the default recommendation

Best default for any application that talks to external systems, which is nearly all of them. Application core defines service interfaces (ports); adapters implement them (real API, mock, in-memory); a composition root / DI container picks the implementation. In frontends this shows up as service interfaces + API/mock factory pairs + a container; in backends as repositories and gateways behind interfaces. Cheap to adopt incrementally — one boundary at a time — and it buys testability immediately. Recommend it whenever boundaries are leaky or mocking requires monkey-patching.

### Clean Architecture — when application rules outgrow CRUD

Entities → use-cases → interface adapters → frameworks, dependencies pointing inward. Reach for it when there are real application rules: multi-step workflows, policies that combine several entities, logic that must run identically from multiple entry points (HTTP, job, CLI). Its cost is ceremony; do not recommend the full ring structure for a CRUD app — hexagonal alone covers those.

### MVVM — for UI-heavy clients

View (screens/components, purely compositional) → ViewModel (stores, state containers, presenters: orchestration, loading flags, derived state) → Model (entities + services). Recommend it for SPAs and mobile apps, and pair it with hexagonal services: the ViewModel calls ports, never transport. Diagnostic cue: if screens contain fetch calls or business branching, the codebase wants MVVM and doesn't have it yet.

### DDD — tactical patterns only when the domain earns them

Split the recommendation:

- **Strategic DDD is almost always worth applying lightly**: bounded contexts as feature modules, one owning module per concept, a ubiquitous language reflected in type names. Recommend this freely — it is just ownership done well.
- **Tactical DDD** (aggregates, value objects, domain events, repositories-per-aggregate) only when the domain is genuinely complex: many invariants that must hold across entities, deep domain vocabulary, business people who talk about rules rather than screens. For thin domains, tactical DDD is pure ceremony — say so.

### Simple layered — legitimate, when standardized

Controllers/routes → services → data access (or screens → stores → API layer) with no inversion. Perfectly good for small teams, CRUD-dominant apps, and codebases whose problems are drift rather than coupling. The recommendation for a layered codebase is usually not "add hexagons" but "pick one way per concern and enforce it". The sin is never layering; it is five ways of doing the same thing.

## Fit signals

- **Domain complexity** (pushes toward Clean/DDD): invariants spanning entities, state machines, policy tables, calculation engines, domain words in the ticket titles.
- **Integration count** (pushes toward hexagonal): several external services, an API that changes under you, a hard requirement to run offline/mocked/in tests.
- **UI weight** (pushes toward MVVM): most code is screens and interaction state.
- **Team and size** (pushes toward layered): small team, small app, low churn. Do not gold-plate.

## Anti-patterns to hunt for

Flag these by name in the diagnosis, each with counts and exemplars:

- **Smart UI / fat controller**: business rules and transport calls inside views or route handlers.
- **Anemic pass-through layer**: a "service" layer where every method is a one-line proxy — the boundary exists on paper but earns nothing; either give it the orchestration it should own or question it.
- **Dumping-ground shared/**: `shared/`, `common/`, `utils/` accumulating domain types and feature logic.
- **Leaky boundary**: vendor/transport types (Axios responses, ORM rows, API DTOs) used directly in UI or domain code.
- **Half-adopted pattern**: two state libraries, two data-access styles, two form approaches — one of them is legacy; make the user pick.
- **Split representation**: the same building-block role declared through different constructs — a DTO as a class in one module and a type in another, enums as both TypeScript `enum` and const objects, services as both factory functions and classes. One role, one construct, everywhere.
- **Role-name misuse**: an artifact whose name claims one role while its content is another — a `types/` file exporting functions, a "DTO" carrying methods, a "helper" owning state, a "util" doing I/O. Rename it to its true role or move the content to that role's home; a wrong label corrupts the vocabulary every other rule relies on.
- **Module anisomorphism**: feature modules with divergent internal trees — the same file kind living in three different homes depending on which module you open. Diff every module against the modal module shape; the target architecture defines one module template and every module converges to it.
- **Unmapped folders**: folders that correspond to no role in the declared architecture. Each one is either an undeclared layer that must be legitimized and documented, or a dumping ground to dissolve into real owners — never leave one unexplained.
- **Cyclic modules**: feature A imports B imports A; ownership is mis-located.
- **Config scattered as literals**: magic IDs, labels, tunables inlined at use sites instead of one typed configuration home.
- **Folder-by-type at scale**: global `controllers/`, `models/`, `views/` folders once the app has clear feature areas that would each own a vertical slice.
- **README architecture**: docs claim a pattern the imports disprove. Diagnose the imports.

## Naming the de facto architecture

Choose the closest canonical name, then state deviations — "layered MVC with an accidental second data-access path", "MVVM with hexagonal services, drifting in the forms layer". Never grade the codebase against an architecture it never attempted; grade it first against its own dominant convention, then against the recommended target.
