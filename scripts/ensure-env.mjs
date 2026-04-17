import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve('.env');
const examplePath = resolve('.env.example');

if (!existsSync(envPath) && existsSync(examplePath)) {
  copyFileSync(examplePath, envPath);
  console.log('Created .env from .env.example');
}
