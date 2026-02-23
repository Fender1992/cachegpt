/**
 * Desktop build orchestrator.
 * Runs prep -> next build -> restore, ensuring restore always runs.
 */
const { execSync } = require('child_process');
const path = require('path');

const prep = path.join(__dirname, 'desktop-build-prep.js');

// Pre-build: move server-only files out of the way
execSync(`node "${prep}" pre`, { stdio: 'inherit' });

let exitCode = 0;
try {
  execSync('npx next build', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
} catch (err) {
  exitCode = err.status || 1;
} finally {
  // Always restore files
  execSync(`node "${prep}" post`, { stdio: 'inherit' });
}

process.exit(exitCode);
