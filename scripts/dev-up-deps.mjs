import { execFileSync, spawnSync } from 'node:child_process';

const composeFile = 'docker/docker-compose.yml';
const services = ['minecraft-server', 'mempalace'];
const healthContainers = ['yfm-minecraft', 'yfm-mempalace'];

function runDocker(args) {
  const result = spawnSync('docker', args, { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

function dockerComposeSupportsWait() {
  const probe = spawnSync('docker', ['compose', 'up', '--help'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (probe.error) {
    return false;
  }

  const output = `${probe.stdout || ''}\n${probe.stderr || ''}`;
  return output.includes('--wait');
}

function getContainerHealth(container) {
  try {
    const value = execFileSync(
      'docker',
      ['inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', container],
      { encoding: 'utf8' },
    ).trim();

    return value;
  } catch {
    return 'unknown';
  }
}

async function waitForHealthyContainers(timeoutMs = 240000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const states = healthContainers.map((name) => getContainerHealth(name));
    const allReady = states.every((state) => state === 'healthy' || state === 'none');

    if (allReady) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const finalStates = healthContainers
    .map((name) => `${name}: ${getContainerHealth(name)}`)
    .join(', ');
  throw new Error(`Timed out waiting for services to be healthy (${finalStates})`);
}

async function main() {
  const baseArgs = ['compose', '-f', composeFile, 'up', ...services, '-d'];

  if (dockerComposeSupportsWait()) {
    runDocker([...baseArgs, '--wait']);
    return;
  }

  runDocker(baseArgs);
  await waitForHealthyContainers();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
