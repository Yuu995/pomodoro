const { spawnSync } = require('child_process');
const path = require('path');

if (process.platform !== 'darwin') process.exit(0);

const root = path.join(__dirname, '..');
const source = path.join(root, 'helpers', 'front-window-state.m');
const output = path.join(root, 'helpers', 'front-window-state');
const args = [
  'clang',
  '-fobjc-arc',
  '-O2',
  '-arch', 'arm64',
  '-arch', 'x86_64',
  '-framework', 'Cocoa',
  '-framework', 'CoreGraphics',
  source,
  '-o', output
];

const result = spawnSync('xcrun', args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
