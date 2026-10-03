#!/usr/bin/env node
// Repository validator: manifests, skill/agent frontmatter, relative links, anti-pattern ids, anonymisation.
// Usage: node scripts/validate.mjs        (exit 1 on any error)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugin = path.join(root, 'plugins', 'copilot-managed-runtime');
const errors = [];
const warnings = [];
const rel = p => path.relative(root, p).split(path.sep).join('/');
const err = (f, m) => errors.push(`${rel(f)}: ${m}`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

// 1. Manifests
const manifests = ['marketplace.json', '.claude-plugin/marketplace.json',
  'plugins/copilot-managed-runtime/.claude-plugin/plugin.json', 'plugins/copilot-managed-runtime/.plugin/plugin.json'];
const parsed = {};
for (const m of manifests) {
  const f = path.join(root, m);
  if (!fs.existsSync(f)) { err(f, 'missing manifest'); continue; }
  try { parsed[m] = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, `invalid JSON: ${e.message}`); }
}
const versions = new Set();
for (const [m, j] of Object.entries(parsed)) {
  if (j.plugins) {
    versions.add(j.metadata?.version);
    for (const p of j.plugins) {
      versions.add(p.version);
      if (!fs.existsSync(path.join(root, p.source))) err(path.join(root, m), `plugin source not found: ${p.source}`);
    }
  } else versions.add(j.version);
}
if (versions.size > 1) errors.push(`manifest versions differ: ${[...versions].join(', ')}`);
const [pj1, pj2] = manifests.slice(2).map(m => JSON.stringify(parsed[m]));
if (pj1 !== pj2) errors.push('plugin.json files under .claude-plugin/ and .plugin/ must be identical');

// 2. Skills
const skillsDir = path.join(plugin, 'skills');
const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
for (const s of skills) {
  const f = path.join(skillsDir, s, 'SKILL.md');
  if (!fs.existsSync(f)) { err(path.join(skillsDir, s), 'missing SKILL.md'); continue; }
  const fm = frontmatter(f);
  if (!fm) { err(f, 'missing frontmatter'); continue; }
  if (fm.name !== s) err(f, `frontmatter name "${fm.name}" must equal folder "${s}"`);
  if (!/^[a-z0-9-]{1,64}$/.test(fm.name ?? '')) err(f, 'name must be lowercase kebab-case, max 64 chars');
  const d = fm.description ?? '';
  if (!d) err(f, 'missing description');
  if (d.length > 1024) err(f, `description is ${d.length} chars (max 1024)`);
  if (!d.includes('USE WHEN')) err(f, 'description must contain "USE WHEN"');
  if (!d.includes('DO NOT USE WHEN')) err(f, 'description must contain "DO NOT USE WHEN"');
}

// 3. Agents
const agentsDir = path.join(plugin, 'agents');
for (const a of fs.readdirSync(agentsDir).filter(n => n.endsWith('.md'))) {
  const f = path.join(agentsDir, a);
  const fm = frontmatter(f);
  if (!fm?.name || !fm?.description) { err(f, 'agent needs name and description frontmatter'); continue; }
  if (fm.name !== a.replace(/\.md$/, '')) err(f, `agent name "${fm.name}" must equal file name`);
}

// 4. Hooks reference existing scripts
const hooksFile = path.join(plugin, 'hooks', 'hooks.json');
try {
  const hooks = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
  for (const groups of Object.values(hooks.hooks ?? {}))
    for (const g of groups) for (const h of g.hooks ?? [])
      for (const m of String(h.command).matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/g))
        if (!fs.existsSync(path.join(plugin, m[1]))) err(hooksFile, `hook script not found: ${m[1]}`);
} catch (e) { err(hooksFile, `invalid hooks.json: ${e.message}`); }

// 5. Links, AP ids, anonymisation across all text files
const files = walk(root);
const md = files.filter(f => f.endsWith('.md'));
const apFile = path.join(plugin, 'references', 'anti-patterns.md');
const apDefined = new Set([...fs.readFileSync(apFile, 'utf8').matchAll(/^\|\s*(AP-\d+)\s*\|/gm)].map(m => m[1]));
if (apDefined.size === 0) err(apFile, 'no anti-pattern ids found');

for (const f of md) {
  const text = fs.readFileSync(f, 'utf8');
  const noCode = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of noCode.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const clean = decodeURIComponent(target.split('#')[0]);
    if (!clean) continue;
    if (!fs.existsSync(path.resolve(path.dirname(f), clean))) err(f, `broken link: ${target}`);
  }
  if (f !== apFile) {
    for (const m of text.matchAll(/\bAP-(\d{2})\b/g)) {
      const id = `AP-${m[1]}`;
      if (!apDefined.has(id)) err(f, `unknown anti-pattern id ${id}`);
    }
  }
}

const textExt = /\.(md|json|mjs|js|ts|tsx|ya?ml|ps1|sh|svg|txt)$/i;
const guid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const allowedGuid = /^0{8}-0{4}-0{4}-0{4}-0{12}$|^1{8}-1{4}-1{4}-1{4}-1{12}$/;
const tenantHost = /\b([a-z0-9-]+)\.(?:api\.)?(onmicrosoft\.com|crm\d*\.dynamics\.com|sharepoint\.com)\b/gi;
const allowedHostPrefix = /^(contoso|fabrikam|example|your-?tenant|yourorg|org|tenant|\*)/i;
let deny = [];
const denyFile = path.join(root, '.anonymise-denylist');
if (fs.existsSync(denyFile)) deny = fs.readFileSync(denyFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));

for (const f of files.filter(f => textExt.test(f) && path.basename(f) !== '.anonymise-denylist')) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(guid)) if (!allowedGuid.test(m[0])) err(f, `possible real identifier (GUID) ${m[0]} — use a placeholder`);
  for (const m of text.matchAll(tenantHost)) if (!allowedHostPrefix.test(m[1])) err(f, `possible real tenant host ${m[0]} — use contoso`);
  const lower = text.toLowerCase();
  for (const d of deny) if (lower.includes(d.toLowerCase())) err(f, 'contains a term from .anonymise-denylist');
}

for (const w of warnings) console.warn(`warn  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error ${e}`);
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log(`OK — ${skills.length} skills, ${apDefined.size} anti-patterns, ${md.length} markdown files checked.`);
