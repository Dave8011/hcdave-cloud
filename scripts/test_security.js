import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testScript = path.join(__dirname, '..', 'agent', 'test_security.cjs');
const res = spawnSync(process.execPath, [testScript], { stdio: 'inherit' });
process.exit(res.status ?? 0);
