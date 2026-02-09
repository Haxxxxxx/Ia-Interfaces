const path = require('path');
const fs = require('fs');

const c = {
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

const skipDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.firebase', '__pycache__', '.cache']);

function showTree(dirPath, maxDepth = 4, showFiles = true) {
  const result = [];
  const cwd = process.cwd();
  const fullPath = path.resolve(cwd, dirPath);

  function walkTree(currentPath, prefix, depth) {
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      const filtered = entries.filter(e => !e.name.startsWith('.') && !skipDirs.has(e.name));
      const sorted = filtered.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      const dirs = sorted.filter(e => e.isDirectory());
      const files = showFiles ? sorted.filter(e => !e.isDirectory()).slice(0, 5) : [];
      const items = [...dirs, ...files];

      items.forEach((entry, idx) => {
        const isLast = idx === items.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const newPrefix = prefix + (isLast ? '    ' : '│   ');

        if (entry.isDirectory()) {
          result.push(`${prefix}${connector}${c.blue}${entry.name}/${c.reset}`);
          walkTree(path.join(currentPath, entry.name), newPrefix, depth + 1);
        } else if (showFiles) {
          result.push(`${prefix}${connector}${entry.name}`);
        }
      });

      if (!showFiles && sorted.filter(e => !e.isDirectory()).length > 0) {
        result.push(`${prefix}    ${c.dim}(${sorted.filter(e => !e.isDirectory()).length} files)${c.reset}`);
      }
    } catch {}
  }

  result.push(`${c.bold}${path.basename(fullPath) || fullPath}/${c.reset}`);
  walkTree(fullPath, '', 0);
  return result.join('\n');
}

function findDeepestFile(pattern, startDir = '.') {
  const cwd = process.cwd();
  const fullStartDir = path.resolve(cwd, startDir);
  const files = [];
  const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');

  function walk(currentPath, depth) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullEntryPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          if (!skipDirs.has(entry.name)) {
            walk(fullEntryPath, depth + 1);
          }
        } else if (regex.test(entry.name)) {
          files.push({
            path: fullEntryPath,
            depth,
            relativePath: path.relative(cwd, fullEntryPath),
          });
        }
      }
    } catch {}
  }

  walk(fullStartDir, 0);
  files.sort((a, b) => b.depth - a.depth);

  const result = [];
  result.push(`${c.bold}Deepest files matching "${pattern}":${c.reset}\n`);

  const top = files.slice(0, 10);
  for (const f of top) {
    const depthBar = '█'.repeat(Math.min(f.depth, 10));
    result.push(`${c.dim}${depthBar.padEnd(10)}${c.reset} ${c.cyan}${f.relativePath}${c.reset} ${c.dim}(depth: ${f.depth})${c.reset}`);
  }

  if (files.length > 0) {
    const deepest = files[0];
    result.push(`\n${c.green}Deepest:${c.reset} ${deepest.relativePath}`);
  }

  return result.join('\n');
}

console.log('=== Testing Tree Tool ===\n');
console.log(showTree('..', 3, false));

console.log('\n=== Testing FindDeepest Tool ===\n');
console.log(findDeepestFile('*.ts', '..'));

console.log('\n=== Navigation Test Complete ===\n');
console.log(`${c.green}✓${c.reset} Tree and FindDeepest tools working correctly`);
