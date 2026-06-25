import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useUIStore } from '../../stores/uiStore';
import { useCommands } from '../../commands/registry';
import { filterCommands } from '../../commands/filterCommands';
import type { Command } from '../../commands/types';
import styles from './CommandPalette.module.css';

/**
 * Keyboard-first command launcher, opened with ⌘K / Ctrl+K.
 *
 * Built on Radix Dialog for focus-trap, backdrop click-to-close, and
 * Escape handling. Open state is driven entirely by `useUIStore` —
 * nothing is owned locally beyond the ephemeral query and highlight index,
 * which live in `CommandPaletteInner` and are reset on each open by
 * remounting via a `key` prop.
 *
 * @example
 * // Mount once at the top of the component tree (App.tsx).
 * <CommandPalette />
 */
export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);

  // Radix Dialog calls onOpenChange(false) for both Esc and backdrop clicks,
  // which syncs the store so the canonical close path is always the store.
  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        {/*
         * Re-key on each open so the inner component remounts with fresh local
         * state (query = '', highlightIndex = 0) every time the palette opens.
         * A boolean key works because the inner component is only rendered
         * while open === true.
         */}
        {open && <CommandPaletteInner onClose={() => setOpen(false)} />}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Inner content — remounted on every open, so all useState starts fresh.
// ---------------------------------------------------------------------------

interface CommandPaletteInnerProps {
  /** Called when a command is run or the user explicitly closes via this UI. */
  onClose: () => void;
}

/**
 * The interactive panel content of the command palette.
 * Rendered only while the palette is open; remounted on every open so that
 * `query` and `highlightIndex` always start at their defaults.
 */
function CommandPaletteInner({ onClose }: CommandPaletteInnerProps) {
  const selectedIds = useUIStore((s) => s.selectedIds);
  const commands = useCommands();

  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filtered, ranked list for the current query and selection context.
  const visibleCommands: Command[] = filterCommands(query, commands, { selectedIds });

  // Clamp the highlight to the current list length — derived synchronously,
  // no effect required (avoids the react-hooks/set-state-in-effect rule).
  const safeIndex =
    visibleCommands.length === 0
      ? 0
      : Math.min(highlightIndex, visibleCommands.length - 1);

  /**
   * Execute the command at `index` and close the palette.
   */
  const runCommand = (index: number): void => {
    const cmd = visibleCommands[index];
    if (!cmd) return;
    cmd.run();
    onClose();
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setQuery(e.target.value);
    // Reset highlight to first item whenever the query changes.
    setHighlightIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next =
          visibleCommands.length === 0
            ? 0
            : (safeIndex + 1) % visibleCommands.length;
        setHighlightIndex(next);
        scrollItemIntoView(listRef.current, next);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev =
          visibleCommands.length === 0
            ? 0
            : (safeIndex - 1 + visibleCommands.length) % visibleCommands.length;
        setHighlightIndex(prev);
        scrollItemIntoView(listRef.current, prev);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        runCommand(safeIndex);
        break;
      }
    }
  };

  return (
    <Dialog.Content
      className={styles.panel}
      aria-label="Command palette"
      onOpenAutoFocus={(e) => {
        // Prevent Radix from focusing the panel itself; focus the input instead.
        e.preventDefault();
        inputRef.current?.focus();
      }}
    >
      {/* Visually hidden title satisfies Radix's accessibility requirement. */}
      <Dialog.Title className={styles.srOnly}>Command palette</Dialog.Title>

      {/* Search input */}
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={visibleCommands.length > 0}
        aria-autocomplete="list"
        aria-controls="command-palette-list"
        aria-activedescendant={
          visibleCommands.length > 0 ? `cmd-item-${safeIndex}` : undefined
        }
        className={styles.input}
        placeholder="Search commands…"
        value={query}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
      />

      {/* Scrollable command list */}
      <ul
        ref={listRef}
        id="command-palette-list"
        role="listbox"
        className={styles.list}
        aria-label="Commands"
      >
        {visibleCommands.length === 0 ? (
          <li className={styles.empty}>No matching commands</li>
        ) : (
          visibleCommands.map((cmd, index) => (
            <li
              key={cmd.id}
              id={`cmd-item-${index}`}
              role="option"
              aria-selected={index === safeIndex}
              className={
                index === safeIndex
                  ? `${styles.item} ${styles.itemHighlighted}`
                  : styles.item
              }
              onMouseEnter={() => setHighlightIndex(index)}
              onClick={() => runCommand(index)}
            >
              <span className={styles.itemTitle}>{cmd.title}</span>
              {cmd.shortcut && (
                <kbd className={styles.shortcut}>{cmd.shortcut}</kbd>
              )}
            </li>
          ))
        )}
      </ul>
    </Dialog.Content>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Scroll the list item at `index` into view, guarding against environments
 * (e.g. jsdom) where `scrollIntoView` is not implemented.
 */
function scrollItemIntoView(list: HTMLUListElement | null, index: number): void {
  if (!list) return;
  const item = list.children[index] as HTMLElement | undefined;
  if (item && typeof item.scrollIntoView === 'function') {
    item.scrollIntoView({ block: 'nearest' });
  }
}
