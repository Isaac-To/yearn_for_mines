// Offline regression checks for the defects originally documented in PERFORMANCE_REVIEW.md.
// Run from the repository root: node scripts/performance-audit.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
for (const workspace of ['@yearn-for-mines/agent', '@yearn-for-mines/mc-mcp-server']) {
  const args = ['--filter', workspace, 'exec', 'vitest', 'run', 'src/__tests__/performance-regressions.test.ts'];
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/c', 'pnpm.cmd', ...args], { cwd, stdio: 'inherit' })
    : spawnSync('pnpm', args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
