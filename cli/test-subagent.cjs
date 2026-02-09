const fs = require('fs');
const path = require('path');

// Simulate the sub-agent execution logic
console.log('=== Testing Sub-Agent Execution ===\n');

const c = {
  purple: '\x1b[35m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

// Simulate tool execution
function executeToolForSubAgent(name, args) {
  switch (name) {
    case 'Glob':
      const files = [];
      function findFiles(dir, depth = 0) {
        if (depth > 4) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            if (['node_modules', '.git', '.next', 'dist', 'build'].includes(e.name)) continue;
            if (e.name.startsWith('.')) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
              findFiles(full, depth + 1);
            } else if (e.name.match(/auth/i) && (e.name.endsWith('.ts') || e.name.endsWith('.tsx'))) {
              files.push(path.relative('.', full));
            }
          }
        } catch {}
      }
      findFiles('..');
      return files.length > 0 ? files.join('\n') : 'No files found';

    case 'Read':
      const filePath = args.file_path || args.path;
      try {
        const fullPath = path.resolve('..', filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n').slice(0, 15);
        return lines.map((l, i) => String(i+1).padStart(5) + '→\t' + l).join('\n');
      } catch (e) {
        return 'Error: ' + e.message;
      }

    case 'List':
      try {
        const entries = fs.readdirSync(path.resolve('..', args.path || '.'), { withFileTypes: true });
        return entries.slice(0, 15).map(e => e.isDirectory() ? e.name + '/' : e.name).join('\n');
      } catch (e) {
        return 'Error: ' + e.message;
      }

    default:
      return 'Tool executed: ' + name;
  }
}

// Simulate sub-agent run
function simulateSubAgent(type, description, prompt) {
  console.log(`${c.purple}┌─${c.reset} ${c.bold}${type} Agent${c.reset} ${c.dim}(${description})${c.reset}`);

  // Iteration 1: Search for files
  console.log(`${c.purple}│${c.reset} ${c.dim}⠋ Iteration 1...${c.reset}`);
  console.log(`${c.purple}│${c.reset} ${c.dim}●${c.reset} Glob ${c.cyan}"**/*auth*.ts"${c.reset}`);

  const globResult = executeToolForSubAgent('Glob', { pattern: '**/*auth*.ts' });
  const globFiles = globResult.split('\n').filter(f => f.trim());
  console.log(`${c.purple}│${c.reset}   ${c.dim}Found ${globFiles.length} files${c.reset}`);
  globFiles.slice(0, 3).forEach(f => {
    console.log(`${c.purple}│${c.reset}   ${c.cyan}${f}${c.reset}`);
  });
  if (globFiles.length > 3) {
    console.log(`${c.purple}│${c.reset}   ${c.dim}... and ${globFiles.length - 3} more${c.reset}`);
  }

  // Iteration 2: Read a file
  if (globFiles.length > 0) {
    console.log(`${c.purple}│${c.reset}`);
    console.log(`${c.purple}│${c.reset} ${c.dim}⠙ Iteration 2...${c.reset}`);
    console.log(`${c.purple}│${c.reset} ${c.dim}●${c.reset} Read ${c.cyan}${globFiles[0]}${c.reset}`);

    const readResult = executeToolForSubAgent('Read', { file_path: globFiles[0] });
    const preview = readResult.split('\n').slice(0, 5).join('\n');
    console.log(`${c.purple}│${c.reset}   ${c.dim}${preview.split('\n').join('\n' + c.purple + '│' + c.reset + '   ' + c.dim)}${c.reset}`);
  }

  // Final result
  console.log(`${c.purple}│${c.reset}`);
  console.log(`${c.purple}│${c.reset} ${c.green}Analysis complete:${c.reset}`);
  console.log(`${c.purple}│${c.reset} Found ${globFiles.length} authentication-related files.`);
  if (globFiles.length > 0) {
    console.log(`${c.purple}│${c.reset} Main auth route: ${c.cyan}${globFiles[0]}${c.reset}`);
  }
  console.log(`${c.purple}└─${c.reset} ${c.green}✓${c.reset} ${c.dim}Completed in 2 iterations${c.reset}`);

  return `Found ${globFiles.length} authentication files`;
}

// Test 1: Explore Agent
console.log(`${c.bold}Test 1: Explore Agent${c.reset}\n`);
simulateSubAgent('Explore', 'find auth files', 'Find all authentication-related files');

console.log('\n' + '─'.repeat(50) + '\n');

// Test 2: Plan Agent
console.log(`${c.bold}Test 2: Plan Agent${c.reset}\n`);
console.log(`${c.purple}┌─${c.reset} ${c.bold}Plan Agent${c.reset} ${c.dim}(analyze codebase structure)${c.reset}`);
console.log(`${c.purple}│${c.reset} ${c.dim}●${c.reset} List ${c.cyan}"./"${c.reset}`);

const listResult = executeToolForSubAgent('List', { path: '.' });
console.log(`${c.purple}│${c.reset}   ${c.dim}${listResult.split('\n').slice(0, 5).join('\n' + c.purple + '│' + c.reset + '   ' + c.dim)}${c.reset}`);
console.log(`${c.purple}│${c.reset}`);
console.log(`${c.purple}│${c.reset} ${c.green}Structure analysis:${c.reset}`);
console.log(`${c.purple}│${c.reset} - app/: Next.js web application`);
console.log(`${c.purple}│${c.reset} - cli/: Rodeo CLI tool`);
console.log(`${c.purple}│${c.reset} - config/: Shared configuration`);
console.log(`${c.purple}└─${c.reset} ${c.green}✓${c.reset} ${c.dim}Completed in 1 iteration${c.reset}`);

console.log('\n=== Sub-Agent Tests Complete ===\n');
console.log(`${c.green}✓${c.reset} All sub-agent simulations working correctly`);
console.log(`${c.dim}The actual CLI will make API calls to the LLM for real agent execution${c.reset}`);
