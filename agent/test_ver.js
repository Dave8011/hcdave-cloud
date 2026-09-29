const { execSync } = require('child_process');
let GIT_VERSION = '1.0.0';
try {
  const logMsg = execSync('git log --grep="^v[0-9]" -1 --format="%s"', { cwd: __dirname, stdio: 'pipe' }).toString().trim();
  const match = logMsg.match(/^v([0-9]+\.[0-9]+\.[0-9]+)/);
  if (match) {
    GIT_VERSION = match[1];
  }
} catch (e) {
  console.log("Error:", e.message);
}
console.log(GIT_VERSION);
