import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Never descend into git worktrees (created under .claude/worktrees/ during
    // isolated sessions). They are full repo copies, so without this Vitest
    // would discover and re-run every test a second time from the worktree.
    exclude: [...configDefaults.exclude, '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Focus coverage on application logic; exclude generated/config files,
      // type-only modules, and the app entrypoint that just mounts React.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/types/**',
      ],
    },
  },
});
