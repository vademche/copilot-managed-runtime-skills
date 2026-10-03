#!/usr/bin/env node
// Copy the plugin's skills (and references, optionally agents) into any agent's skill root.
// Usage: node scripts/install.mjs <dest-root> [--agents] [--force]
//   e.g. node scripts/install.mjs .github            (VS Code / GitHub Copilot, per repo)
//        node scripts/install.mjs ~/.copilot          (Copilot CLI, per user)
//        node scripts/install.mjs .claude --agents    (Claude Code, per repo)
// Result: <dest-root>/skills/cmr-*/SKILL.md and <dest-root>/references/*.md
// (skills link to ../../references, so both folders must be siblings).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const destArg = args.find(a => !a.startsWith('--'));
if (!destArg || flags.has('--help')) {
  console.log('Usage: node scripts/install.mjs <dest-root> [--agents] [--codex] [--force]');
  process.exit(destArg ? 0 : 1);
}
const dest = path.resolve(destArg.replace(/^~(?=$|[\\/])/, os.homedir()));
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugins', 'copilot-managed-runtime');

const plan = [['skills', 'skills'], ['references', 'references']];
if (flags.has('--agents')) plan.push(['agents', 'agents']);

const codexAgentsDir = path.join(path.dirname(dest), '.codex', 'agents');
const agentFiles = fs.readdirSync(path.join(src, 'agents')).filter(f => f.endsWith('.md'));

const conflicts = [];
for (const [from, to] of plan) {
  for (const name of fs.readdirSync(path.join(src, from))) {
    const target = path.join(dest, to, name);
    if (fs.existsSync(target)) conflicts.push(target);
  }
}
if (flags.has('--codex')) {
  for (const f of agentFiles) {
    const target = path.join(codexAgentsDir, f.replace(/\.md$/, '.toml'));
    if (fs.existsSync(target)) conflicts.push(target);
  }
}
if (conflicts.length && !flags.has('--force')) {
  console.error('These targets already exist (re-run with --force to overwrite):');
  for (const c of conflicts) console.error(`  ${c}`);
  process.exit(1);
}

let count = 0;
for (const [from, to] of plan) {
  fs.mkdirSync(path.join(dest, to), { recursive: true });
  for (const name of fs.readdirSync(path.join(src, from))) {
    fs.cpSync(path.join(src, from, name), path.join(dest, to, name), { recursive: true, force: true });
    count++;
  }
}
console.log(`Installed ${count} items into ${dest}`);

// Codex custom agent: name, description, developer_instructions (+ read-only sandbox for reviewers).
function toCodexAgent(markdown) {
  const m = markdown.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('agent file has no front matter');
  const fm = Object.fromEntries(m[1].split('\n').map(l => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map(x => [x[1], x[2]]));
  const body = m[2].trim();
  if (body.includes("'''")) throw new Error('agent body contains a TOML literal delimiter');
  const readOnly = !/\b(Edit|Write)\b/.test(fm.tools ?? '');
  return [
    `name = ${JSON.stringify(fm.name)}`,
    `description = ${JSON.stringify(fm.description)}`,
    ...(readOnly ? ['sandbox_mode = "read-only"'] : []),
    `developer_instructions = '''\n${body}\n'''`,
    '',
  ].join('\n');
}

if (flags.has('--codex')) {
  fs.mkdirSync(codexAgentsDir, { recursive: true });
  for (const f of agentFiles) {
    const toml = toCodexAgent(fs.readFileSync(path.join(src, 'agents', f), 'utf8'));
    fs.writeFileSync(path.join(codexAgentsDir, f.replace(/\.md$/, '.toml')), toml);
  }
  console.log(`Converted ${agentFiles.length} agents into Codex custom agents in ${codexAgentsDir}`);
}
console.log('Hooks are not copied: use the plugin install (Copilot CLI / Claude Code / Codex) to get the generated-code guard.');
