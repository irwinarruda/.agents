# Code Guide

Plain TypeScript/JavaScript code structure: formatting, whitespace, types, functions, naming, imports, comments. Load this when no project-scope skill owns general coding style (e.g., no local `code-guide` or `client-coding-styleguide`). React/JSX/state lives in `react-guide.md`.

## Philosophy and precedence

Write simple, direct code that reads in one pass. Boring beats clever. Write TypeScript like a native: lean on inference and the language's own idioms, not patterns carried over from other languages.

When sources disagree, the higher one wins:

1. The surrounding file's existing pattern.
2. Formatter and linter output for mechanical decisions.
3. This guide, as the default.

Style is a tie-breaker, not a refactor mandate. Match the file you are in. Make focused edits on touched code. Do not restyle untouched lines just to tidy a diff, and do not run broad unrelated refactors while doing a local change. If a file consistently uses a different convention, follow the file unless Irwin explicitly asks to migrate it.

## Formatting

Let the project's formatter and linter own mechanical output — Biome, Prettier, or ESLint autofix. Do not hand-tune indentation, quotes, semicolons, trailing commas, or line width. Irwin's repos pin different values (single quotes and 120 width in some, double quotes and 80 in others), so never assume. The project config is the truth, and this guide deliberately does not pin them.

Trust the formatter rather than fighting it. If `organizeImports` runs, accept its grouping: external packages first, then alias imports, then relative imports, with a blank line between groups.

## Whitespace

Avoid decorative blank lines inside a single scope. Keep statements that form one immediate thought together. The goal is scannability, not visible breathing room for its own sake.

Do not add blank lines inside:

- `if` / `else`
- `switch`
- loops
- `try` / `catch` / `finally`
- object literals
- array literals
- short helper functions

Use blank lines between distinct top-level scopes: separate functions, class members, or genuinely separate phases of longer logic.

Remove a blank line when it separates things that read as one thought:

- A variable assignment and the `if`, `return`, or call that immediately uses it.
- Sequential test arrange / act / assert lines when the flow scans fine without them.
- Adjacent branches in a small guard or helper.
- Short, related event handlers in the same handler group.
- Consecutive constant declarations — keep them together.

Keep a blank line when it separates top-level declarations, import groups, unrelated phases of longer logic, or large sections where the gap genuinely improves scanning.

## `const` / `let` / `var`

- `const` by default.
- `let` only when reassignment is genuinely needed.
- Never `var`.

## Type inference

Prefer inferred types for variables and function return values. Omit explicit types when TypeScript expresses the contract clearly. Add explicit types when they:

- Define a public contract (exported service methods, repository contracts).
- Satisfy a contract or a generic boundary.
- Prevent TypeScript from inferring a wider or less useful type.

Keep explicit parameter types unless they are inferred from the call site (contextually typed callbacks).

Avoid explicit function return types by default:

```ts
function createProject(input: ProjectInput) {
  return new Project(input);
}

// Use when the contract matters
type ProjectRepository = {
  create(input: ProjectInput): Promise<Project>;
};
```

## `type` over `interface`

Declare shapes with `type`, not `interface`: object types, component props, DTOs, and the contracts a class implements. Compose them with `&` instead of `extends`.

```ts
type ProjectInput = {
  name: string;
  ownerId: string;
};

type ArchivedProject = Project & {
  archivedAt: Date;
};
```

Use `interface` only to add to a type that a library or the global scope already declares as an interface (module or global augmentation), because that needs declaration merging. In a file that already uses `interface` throughout, follow the file and don't convert it as a side effect.

## `null` vs `undefined`

Prefer `undefined` in application types, DTOs, entities, and component props. Do not use `null` in those layers.

`null` is for boundaries that require it:

- SQL — the `postgres` driver needs JavaScript `null` to bind SQL `NULL`. Keep `undefined` through the application layer, then convert to `null` at the query boundary with `?? null`, directly in the parameter object or values list. Do not let SQL `null` leak back into DTOs, entities, services, or props.
- Some legacy or external APIs that mandate `null`.

Convert as close to the boundary as possible.

Prefer `param?: Type` over `param: Type | undefined`.

## Defaults: `??` over `||`

Use `??` instead of `||` for defaults so `0`, `false`, and `''` survive.

## Functions and conditionals

- Prefer function declarations for named functions.
- Arrow functions are for callbacks and higher-order APIs. Avoid standalone arrow functions for regular named logic (`const getData = () => {}`).
- Anonymous callbacks are fine for short inline operations (`items.map((item) => item.id)`) and for third-party callback APIs (`useEffect(() => { … }, [])`).
- Prefer `if/else` before calling an optional function. Optional chaining is fine for property access and display-safe reads.
- Avoid nested ternaries. Use a small function or `if/else` with a local variable when the condition is not trivial.

## Classes and helpers

Keep class and function logic inline by default. Do not split logic into private helpers only to make a class look smaller. Extract a separate method or function when the same logic is reused more than once, or when the extracted name creates a genuinely clearer concept. Do not create abstractions solely to shorten a file.

Avoid unused objects, dead variables, decorative helpers, and spread/destructuring that allocates or obscures intent without earning it.

## Whole-body `try`

When a function needs `try`/`catch` or `try`/`finally`, open the `try` at the top of the function so the entire body lives inside it — guards, reads, state updates, and cleanup together. A narrower `try` is acceptable only when the function genuinely has two independent phases and only one needs protection.

```ts
async function submitForm(input: FormInput) {
  try {
    if (!input.email) {
      throw new DeveloperError('submitForm called without email');
    }
    setSubmitting(true);
    await formService.submit(input);
  } finally {
    setSubmitting(false);
  }
}
```

## Naming

### Language

Identifiers — variables, functions, types, components — are plain English words. Do not mix languages inside one identifier. Some domain models permit Portuguese domain nouns as a generic convention, but a project that standardizes on English wins locally.

### Booleans

Names should communicate truth:

- `is*` — `isLoading`, `isDarkMode`
- `show*` — `showClosed`
- `has*` — `hasPermission`
- `can*` — `canManage`

### Repository / gateway operation verbs

Use a small, consistent verb set:

- `get` / `fetch` — reads
- `create` — new records
- `edit` / `update` — mutations
- `delete` / `remove` — removals
- `upload` — file/binary intake

### Constants

Prefer PascalCase for domain constants, not SCREAMING_SNAKE_CASE:

```ts
const TempoLimite = 5000;
```

### Standard element names

Keep standard web and UI library element names as-is — `Modal`, `Popover`, `Dialog`, `Tooltip`. Do not invent synonyms.

## Imports

- Use the project alias for anything that leaves the current directory (`@/*`, `~/`, etc.).
- Same-directory (`./X`) and direct-child (`./helpers/X`) relative imports are fine.
- Parent traversal (`../`, `../../`) is forbidden when an alias exists and is often enforced at lint level. It keeps import paths stable when files move and avoids `../../..` chains.

```ts
import { Button } from '@/shared/components/ui/button';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import SubComponent from './SubComponent';
import Helper from './helpers/Helper';
```

Type-only imports use `import type { … }`.

## Comments

Code should speak for itself: default to writing no comments at all. If a block seems to need one, rename, extract, or simplify instead. Some Irwin repos (e.g. the-chatbot-v2) forbid comments in application source entirely — defer to that local rule when present.

## Enums over string literal unions

Model closed sets of string values as const-object enums with the `ValueOf` helper instead of string literal union types:

```ts
export const ToolResultStatus = {
  Succeeded: 'succeeded',
  Failed: 'failed',
} as const;
export type ToolResultStatus = ValueOf<typeof ToolResultStatus>;
```

Use `typeof Enum.Member` for discriminated-union members and compare against the enum member, not the raw string. Raw literals are fine only at external boundaries that own the values (SDK wire types, third-party payloads).

## Applying this guide

1. Read the surrounding file/module first.
2. Follow local architecture and formatter config.
3. Apply this style to new and touched code.
4. Keep unrelated churn out of the diff.
5. If two rules conflict, pick the stricter local project rule and mention it briefly if it matters.
