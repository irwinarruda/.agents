# React Guide

React and JSX style: component organization, event handlers, error wrappers, conditional rendering, component locality, and state management (Zustand/MobX). Load this when no project-scope skill owns React/JSX style (e.g., no local `code-guide`, `ui-screen-jsx-guidelines`, `form-architecture`, or `client-jsx-styleguide`). Plain TS/JS structure lives in `code-guide.md`.

## Component internals order

Within a component, prefer this order when it does not create churn or fight a clear local pattern:

1. Props destructuring, constants, refs, state, and other direct variables.
2. Computed values, derived data, memoized values, and selectors.
3. Event handlers, helper functions, async actions, and render helpers.
4. Effects and subscriptions.
5. Return JSX.

Apply the order naturally when adding or touching related code. Do not move code only to satisfy it if that creates churn, changes behavior, or fights a clear local pattern.

## Whitespace inside components

- One blank line between grouped concerns: constants, local function declarations, `useCallback`, `useMemo`, and `useEffect` blocks.
- One blank line before the component's `return`.
- No blank lines within a single group.
- No empty lines inside JSX expression trees, prop groups, or child lists — unless the file has a clear local pattern of using them for large, distinct JSX sections.

## Event handlers

Name handlers `on` + subject + action: `onProjectModalOpen`, `onProjectFormSubmit`, `onProjectNameChange`, `onCreateNew`, `onCloseProcess`, `onDashboardRefreshClick`. Not `handle*` (`handleSubmit`, `handleProjectFormSubmit`).

Use function declarations for handlers. Keep them focused on the domain action.

## Error wrappers at the binding site

When a component uses `useError()`, keep event handlers focused on the domain action and apply `error.handle()` (async) or `error.handleSync()` (sync) where the callback is passed to JSX or component props — not inside the handler body.

```tsx
async function onDashboardRefreshClick() {
  await loadDashboard();
}

<Button onClick={error.handle(onDashboardRefreshClick)} />
<Button onClick={error.handleSync(onCreateNew)} />
```

Avoid wrapping inside the handler body when the wrapper can live at the binding site:

```tsx
function onDashboardRefreshClick() {
  void error.handle(loadDashboard)(); // avoid
}
```

For effects that kick off async work, wrap at the call:

```tsx
useEffect(() => {
  void error.handle(loadProcesses)();
}, []);
```

## Conditional JSX

For conditional JSX with no meaningful else branch, prefer boolean-safe `&&` rendering:

```tsx
{isVisible && <Panel />}
{topTemplates.length > 0 && <Card>…</Card>}
```

Make sure the condition is actually boolean so React does not render unintended values like `0` or a string. When you need to render one of two things, use a ternary or extract a small function instead of nesting ternaries.

Do not add empty lines inside JSX expression trees or prop groups.

## Selectors

Prefer narrow selectors that return the specific value, not whole-store subscriptions:

```tsx
const processes = useApp((s) => s.processes);
const isLoading = useApp((s) => s.isProcessesLoading);
const loadProcesses = useApp((s) => s.loadProcesses);
```

## Component locality

Prefer keeping small, tightly coupled components near the parent in the same file (e.g., a `TemplatesDialog` used only by one screen lives in that screen's file). Move a component to its own file when at least one is true:

- The file is becoming hard to scan.
- The component is reused by another file.
- The component has independent behavior, data loading, tests, or ownership.
- The surrounding module already has a pattern for splitting similar components.

When splitting, keep names explicit. Do not create a new abstraction just to shorten a file.

## State management

### Zustand

**Read state by destructuring `get()`.** Never access state inline as `get().someVariable`. Destructure at the start of an action so reads are explicit and repeated `get()` calls are not hidden inside expressions.

```ts
async getAtivoPorCodigo(codigo: number) {
  const { ativos } = get();
  return ativos.find((ativo) => ativo.codigo === codigo);
}
```

**Method syntax inside stores.** Use normal method syntax, not arrow function properties:

```ts
toggleDarkMode() {
  const { isDarkMode } = get();
  set({ isDarkMode: !isDarkMode });
},
```

**Slice shape.** Declare the type, then a factory that returns state plus methods:

```ts
export type SharedSlice = {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
};

export const sharedSlice: AppState<SharedSlice> = (set, get) => ({
  isDarkMode: false,
  toggleDarkMode() {
    const { isDarkMode } = get();
    set({ isDarkMode: !isDarkMode });
  },
});
```

**Computed / derived state.** Keep derived state in the store using the project's computed-state helper when present (e.g., `zustand-computed-state`). Put at most one computed block per service. Do not mix actions between state and computed, and do not create multiple computed sections in the same service.

**Dependency inversion.** Reach collaborators through the DI container rather than importing services directly inside actions:

```ts
const themeService = container.get('themeService');
```

**Whitespace.** No decorative blank lines inside slices. Order the service as state, then computed (at most one block), then actions, with one blank line separating the sections.

### MobX

Avoid destructuring store values when MobX tracking matters. Read through the store, or assign a local variable for nested paths. When nesting reaches about three levels, create a local variable once instead of keeping long chains in logic.

## Importing components

Use the project alias for anything that leaves the current directory:

```tsx
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { useApp } from '@/shared/stores';
import { useError } from '@/shared/providers/error';
import SubComponent from './SubComponent';
```
