# Help / About Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app Help/About modal that orients early users — quick-start, keyboard-shortcuts reuse, clinical disclaimer, feedback link, and app version.

**Architecture:** A new `HelpOverlay` modal mirrors the existing `ShortcutsOverlay` (Radix `Dialog`, driven by `uiStore.activeModal === 'help'`). The `HelpIsland` `?` button and the onboarding "Help" link open it. App version is injected at build time via a Vite `define` and shown in the panel's About footer.

**Tech Stack:** React 19 + TypeScript, `@radix-ui/react-dialog`, Zustand (`uiStore`), Vite, Vitest + Testing Library, CSS modules.

## Global Constraints

- TypeScript: type-annotate every function signature; never use `any`. JSDoc on exported components.
- Modals are driven exclusively by `uiStore.activeModal` (a string union); only one modal open at a time.
- Reuse the existing keyboard-shortcuts surface — do NOT duplicate the shortcut list. "View all keyboard shortcuts" calls `openModal('shortcuts')`.
- Clinical disclaimer copy is fixed (CDSS boundary language) — use verbatim:
  > Pedigree Canvas is a drawing and documentation tool. It does not provide medical advice, diagnosis, or risk assessment, and does not replace professional clinical judgement or genetic counselling. Always verify symbols, relationships, and annotations against your own records and current clinical standards before relying on a pedigree.
- Feedback link: `mailto:josh.ellis@clintech.dev?subject=Pedigree%20Canvas%20feedback`.
- App name string: `Pedigree Canvas`.
- Tests run under jsdom/vitest (react-dom components only; no Konva).
- Commit style: Conventional Commits; one logical change per commit.

---

### Task 1: Add `'help'` modal state and repoint `HelpIsland`

**Files:**
- Modify: `src/stores/uiStore.ts:13`
- Modify: `src/components/ui/islands/HelpIsland.tsx`
- Test: `src/components/ui/islands/HelpIsland.test.tsx`

**Interfaces:**
- Consumes: `useUIStore().openModal(modal: ActiveModal)`, existing.
- Produces: `ActiveModal` now includes `'help'`. `HelpIsland` button has accessible name `"Help & About"` and opens `'help'`.

- [ ] **Step 1: Update the `HelpIsland` tests to the new behavior**

Replace the three tests in `src/components/ui/islands/HelpIsland.test.tsx` with:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { useUIStore } from '../../../stores/uiStore';
import { HelpIsland } from './HelpIsland';

beforeEach(() => {
  useUIStore.getState().closeModal();
});

test('renders the help button by accessible name', () => {
  render(<HelpIsland />);
  expect(screen.getByRole('button', { name: 'Help & About' })).toBeInTheDocument();
});

test('clicking the button opens the help modal', () => {
  render(<HelpIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Help & About' }));
  expect(useUIStore.getState().activeModal).toBe('help');
});

test('button has correct title attribute', () => {
  render(<HelpIsland />);
  expect(screen.getByRole('button', { name: 'Help & About' })).toHaveAttribute(
    'title',
    'Help & About',
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- HelpIsland`
Expected: FAIL — store has no `'help'` member / button name is still "Keyboard shortcuts".

- [ ] **Step 3: Add `'help'` to the `ActiveModal` union**

In `src/stores/uiStore.ts`, line 13, change:

```ts
export type ActiveModal = 'import' | 'export' | 'settings' | 'legendEditor' | 'shortcuts' | null;
```

to:

```ts
export type ActiveModal =
  | 'import'
  | 'export'
  | 'settings'
  | 'legendEditor'
  | 'shortcuts'
  | 'help'
  | null;
```

- [ ] **Step 4: Repoint `HelpIsland` to open `'help'`**

Replace the body of `src/components/ui/islands/HelpIsland.tsx` with:

```tsx
import { useUIStore } from '../../../stores/uiStore';
import { Island } from './Island';
import styles from './islands.module.css';

/**
 * Floating help island. Renders a single `?` button that opens the
 * Help & About panel (`HelpOverlay`).
 *
 * @example
 * ```tsx
 * <HelpIsland />
 * ```
 */
export function HelpIsland(): React.JSX.Element {
  const handleHelpClick = (): void => {
    useUIStore.getState().openModal('help');
  };

  return (
    <Island aria-label="Help">
      <button
        type="button"
        className={styles.button}
        onClick={handleHelpClick}
        title="Help & About"
        aria-label="Help & About"
      >
        ?
      </button>
    </Island>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- HelpIsland`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/stores/uiStore.ts src/components/ui/islands/HelpIsland.tsx src/components/ui/islands/HelpIsland.test.tsx
git commit -m "feat: add 'help' modal state and repoint HelpIsland (#88)"
```

---

### Task 2: Inject app version at build time

**Files:**
- Modify: `package.json:3` (version bump)
- Modify: `vite.config.ts`
- Modify: `vitest.config.ts`
- Create: `src/vite-env.d.ts`
- Test: `src/appVersion.test.ts`

**Interfaces:**
- Produces: a global `__APP_VERSION__: string` available in app + test bundles, equal to `package.json` `version`.

- [ ] **Step 1: Write the failing test**

Create `src/appVersion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('__APP_VERSION__', () => {
  it('is a non-empty semver-shaped string injected at build time', () => {
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- appVersion`
Expected: FAIL — `__APP_VERSION__ is not defined` (and a TS error, no ambient declaration).

- [ ] **Step 3: Bump the package version**

In `package.json`, change `"version": "0.0.0",` to `"version": "0.1.0",`.

- [ ] **Step 4: Add the ambient type declaration**

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

/** App version string, injected from package.json at build time. */
declare const __APP_VERSION__: string;
```

- [ ] **Step 5: Define the global in the Vite config**

Replace `vite.config.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // Honor the PORT env var when set (e.g. by preview/hosting tooling),
    // falling back to Vite's default dev port.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
```

- [ ] **Step 6: Define the same global in the Vitest config**

In `vitest.config.ts`, add the `define` block and the package read. Insert after the imports:

```ts
import { readFileSync } from 'node:fs';
```

and add a top-level const before `export default`:

```ts
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };
```

then add, as a sibling of `plugins` inside `defineConfig({ ... })`:

```ts
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- appVersion`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json vite.config.ts vitest.config.ts src/vite-env.d.ts src/appVersion.test.ts
git commit -m "feat: inject app version via __APP_VERSION__ build global (#88, #84)"
```

---

### Task 3: Build the `HelpOverlay` component

**Files:**
- Create: `src/components/ui/HelpOverlay.tsx`
- Create: `src/components/ui/HelpOverlay.module.css`
- Test: `src/components/ui/HelpOverlay.test.tsx`

**Interfaces:**
- Consumes: `useUIStore` (`activeModal`, `closeModal`, `openModal`), `__APP_VERSION__`.
- Produces: `HelpOverlay` component (no props), rendered when `activeModal === 'help'`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/HelpOverlay.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { useUIStore } from '../../stores/uiStore';
import { HelpOverlay } from './HelpOverlay';

beforeEach(() => {
  useUIStore.setState({ activeModal: 'help' });
});

afterEach(() => {
  useUIStore.getState().closeModal();
});

test('renders the quick-start heading when the help modal is open', () => {
  render(<HelpOverlay />);
  expect(
    screen.getByRole('heading', { name: /how to build your first pedigree/i }),
  ).toBeInTheDocument();
});

test('shows the clinical disclaimer verbatim', () => {
  render(<HelpOverlay />);
  expect(
    screen.getByText(/does not provide medical advice, diagnosis, or risk assessment/i),
  ).toBeInTheDocument();
});

test('feedback link points to the clintech mailto', () => {
  render(<HelpOverlay />);
  const link = screen.getByRole('link', { name: /send feedback/i });
  expect(link).toHaveAttribute(
    'href',
    'mailto:josh.ellis@clintech.dev?subject=Pedigree%20Canvas%20feedback',
  );
});

test('shows the app name and version in the About footer', () => {
  render(<HelpOverlay />);
  expect(screen.getByText(new RegExp(`Pedigree Canvas v${__APP_VERSION__}`))).toBeInTheDocument();
});

test('"view all keyboard shortcuts" switches the active modal to shortcuts', () => {
  render(<HelpOverlay />);
  fireEvent.click(screen.getByRole('button', { name: /view all keyboard shortcuts/i }));
  expect(useUIStore.getState().activeModal).toBe('shortcuts');
});

test('renders nothing interactive when the help modal is closed', () => {
  useUIStore.setState({ activeModal: null });
  render(<HelpOverlay />);
  expect(
    screen.queryByRole('heading', { name: /how to build your first pedigree/i }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- HelpOverlay`
Expected: FAIL — `HelpOverlay` module not found.

- [ ] **Step 3: Create the stylesheet**

Create `src/components/ui/HelpOverlay.module.css` (reuses the ShortcutsOverlay chrome conventions):

```css
/* Dimmed backdrop — sits below the overlay panel */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  z-index: 900;
  animation: fadeIn 120ms ease;
}

/* Floating dialog panel — centered, island chrome */
.panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 901;
  width: 560px;
  max-width: min(92vw, 560px);
  max-height: 80vh;
  overflow-y: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  animation: slideIn 140ms cubic-bezier(0.16, 1, 0.3, 1);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.closeButton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.closeButton:hover {
  background: var(--color-primary-soft);
  color: var(--color-text);
}

.body {
  padding: 12px 20px 20px;
  overflow-y: auto;
}

.section {
  margin-bottom: 20px;
}

.section:last-child {
  margin-bottom: 0;
}

.sectionLabel {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary);
  margin: 0 0 6px;
}

.steps {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text);
}

.kbd {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-bg, #f7f7f9);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}

.linkButton {
  font-size: 13px;
  color: var(--color-primary, #2563eb);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
}

.disclaimer {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  background: var(--color-bg, #f7f7f9);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 6px);
  padding: 10px 12px;
  margin: 0;
}

.feedbackLink {
  font-size: 13px;
  color: var(--color-primary, #2563eb);
}

.footer {
  border-top: 1px solid var(--color-border);
  padding-top: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.version {
  font-weight: 600;
  color: var(--color-text);
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes slideIn {
  from { opacity: 0; transform: translate(-50%, calc(-50% - 8px)); }
  to   { opacity: 1; transform: translate(-50%, -50%); }
}
```

- [ ] **Step 4: Create the component**

Create `src/components/ui/HelpOverlay.tsx`:

```tsx
import * as Dialog from '@radix-ui/react-dialog';
import { useUIStore } from '../../stores/uiStore';
import styles from './HelpOverlay.module.css';

/** Feedback destination — opens the tester's own mail client. */
const FEEDBACK_HREF = 'mailto:josh.ellis@clintech.dev?subject=Pedigree%20Canvas%20feedback';

/**
 * Help & About modal — orients early users with a quick-start, a link to the
 * keyboard-shortcuts overlay, the clinical disclaimer, a feedback link, and the
 * app version.
 *
 * Driven by `useUIStore` — opens when `activeModal === 'help'` and closes
 * (Esc / click-outside / × button) via `closeModal()`.
 *
 * Mount once at the top of the component tree (App.tsx).
 *
 * @example
 * ```tsx
 * <HelpOverlay />
 * ```
 */
export function HelpOverlay(): React.JSX.Element {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);

  const open = activeModal === 'help';

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      closeModal();
    }
  };

  const handleViewShortcuts = (): void => {
    openModal('shortcuts');
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.panel} aria-describedby={undefined}>
          <Dialog.Title asChild>
            <header className={styles.header}>
              <h2 className={styles.title}>Help &amp; About</h2>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className={styles.closeButton}
                  aria-label="Close help"
                >
                  ×
                </button>
              </Dialog.Close>
            </header>
          </Dialog.Title>

          <Dialog.Description className={styles.srOnly}>
            Quick-start, keyboard shortcuts, clinical disclaimer, feedback, and
            version information for Pedigree Canvas.
          </Dialog.Description>

          <div className={styles.body}>
            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>How to build your first pedigree</h3>
              <ol className={styles.steps}>
                <li>Hover near a person to add relatives.</li>
                <li>Use ▢ ● ◇ to set a person&apos;s sex.</li>
                <li>
                  Hold <kbd className={styles.kbd}>Alt</kbd> and drag from one
                  person to another to link them, then pick the relationship type.
                </li>
                <li>
                  Press <kbd className={styles.kbd}>⌘K</kbd> for all commands.
                </li>
                <li>Open, import, and export from the top-left menu.</li>
              </ol>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Keyboard shortcuts</h3>
              <button
                type="button"
                className={styles.linkButton}
                onClick={handleViewShortcuts}
              >
                View all keyboard shortcuts
              </button>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Disclaimer</h3>
              <p className={styles.disclaimer}>
                Pedigree Canvas is a drawing and documentation tool. It does not
                provide medical advice, diagnosis, or risk assessment, and does
                not replace professional clinical judgement or genetic
                counselling. Always verify symbols, relationships, and
                annotations against your own records and current clinical
                standards before relying on a pedigree.
              </p>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Feedback</h3>
              <a className={styles.feedbackLink} href={FEEDBACK_HREF}>
                Send feedback
              </a>
            </section>

            <footer className={styles.footer}>
              <span className={styles.version}>Pedigree Canvas v{__APP_VERSION__}</span>
              {' — '}your data stays on your device.
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- HelpOverlay`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/HelpOverlay.tsx src/components/ui/HelpOverlay.module.css src/components/ui/HelpOverlay.test.tsx
git commit -m "feat: add HelpOverlay panel with quick-start, disclaimer, feedback, version (#88)"
```

---

### Task 4: Mount `HelpOverlay` and repoint the onboarding "Help" link

**Files:**
- Modify: `src/App.tsx:16,85`
- Modify: `src/components/canvas/OnboardingHints.tsx:67-69`
- Test: `src/components/canvas/OnboardingHints.test.tsx:101-104`

**Interfaces:**
- Consumes: `HelpOverlay` from Task 3; `'help'` modal from Task 1.
- Produces: `HelpOverlay` mounted in the app; onboarding "Help" link opens `'help'`.

- [ ] **Step 1: Update the onboarding "Help" test**

In `src/components/canvas/OnboardingHints.test.tsx`, change the test body at lines 101-104:

```tsx
  test('clicking Help opens the help modal', () => {
    render(<OnboardingHints />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(useUIStore.getState().activeModal).toBe('help');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- OnboardingHints`
Expected: FAIL — handler still opens `'shortcuts'`.

- [ ] **Step 3: Repoint the onboarding handler**

In `src/components/canvas/OnboardingHints.tsx`, change `handleHelp` (lines 67-69):

```tsx
  const handleHelp = (): void => {
    useUIStore.getState().openModal('help');
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- OnboardingHints`
Expected: PASS.

- [ ] **Step 5: Mount `HelpOverlay` in `App.tsx`**

In `src/App.tsx`, add the import after the `ShortcutsOverlay` import (line 16):

```tsx
import { HelpOverlay } from './components/ui/HelpOverlay';
```

and add the component in the modal block, right after `<ShortcutsOverlay />` (line 85):

```tsx
      <ShortcutsOverlay />
      <HelpOverlay />
```

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `npm test -- --run && npx tsc --noEmit`
Expected: All tests PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/canvas/OnboardingHints.tsx src/components/canvas/OnboardingHints.test.tsx
git commit -m "feat: mount HelpOverlay and repoint onboarding Help link (#88)"
```

---

## Self-Review

**Spec coverage:**
- Quick-start → Task 3 §quick-start. ✔
- Keyboard-shortcuts reuse → Task 3 "View all keyboard shortcuts" → `openModal('shortcuts')`. ✔
- Clinical disclaimer → Task 3 §disclaimer (verbatim). ✔
- Feedback mailto → Task 3 §feedback. ✔
- Version/About (#84 prereq) → Task 2 (inject) + Task 3 footer. ✔
- Entry points (HelpIsland, OnboardingHints) → Task 1 + Task 4. ✔
- `?` keyboard shortcut unchanged → not touched (no task modifies `useKeyboardShortcuts.ts`). ✔

**Placeholder scan:** No TBD/TODO; all steps contain concrete code and commands. ✔

**Type consistency:** `ActiveModal` extended in Task 1 and consumed in Tasks 3/4. `__APP_VERSION__` declared in Task 2 (`src/vite-env.d.ts`), defined in both configs, consumed in Task 3. `HelpOverlay` exported in Task 3, imported in Task 4. ✔

**Out of scope confirmed left alone:** analytics (#80), docs site (#87), git tag + CHANGELOG (#84).
