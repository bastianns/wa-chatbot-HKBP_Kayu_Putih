import { spawnSync } from 'child_process';

console.log('🔄 Menjalankan Test Suite Komprehensif (node --test)...\n');
const result = spawnSync('node', ['--test', 'test/*.test.js'], { stdio: 'inherit', shell: true });
process.exit(result.status || 0);
