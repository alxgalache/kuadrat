#!/usr/bin/env node
/**
 * Comprueba que las instrucciones de Claude Code del repositorio siguen
 * cargándose como se diseñaron (ver «Mantenimiento de estas instrucciones» en
 * CLAUDE.md):
 *
 *   node scripts/check-claude-rules.mjs
 *
 * Qué comprueba, y por qué cada cosa:
 *   · CLAUDE.md no pasa de 40.000 caracteres. Se carga en todas las sesiones, y
 *     40.000 es el límite más bajo que aplica Claude Code con cualquier modelo.
 *   · Cada regla de .claude/rules/ empieza con un frontmatter `paths:` en la
 *     forma exacta que documenta CLAUDE.md. Claude Code carga SIEMPRE, sin
 *     avisar, una regla sin `paths` o con un YAML que no sabe leer.
 *   · Cada patrón, y cada alternativa de sus llaves, encuentra al menos un
 *     fichero. Un patrón que no encuentra nada no da ningún error en Claude
 *     Code: la regla simplemente deja de cargarse, que es lo que pasa en
 *     cuanto se renombra un fichero.
 *   · Cada regla figura en el índice de CLAUDE.md, y cada referencia a una
 *     regla apunta a un fichero que existe.
 *   · Las rutas del repositorio citadas en CLAUDE.md, AGENTS.md y las reglas
 *     existen. Así aparecieron los enlaces a cambios de openspec ya archivados.
 *   · Ningún `@ruta` fuera de código en CLAUDE.md ni en las reglas: sería un
 *     import, y un import se carga siempre.
 *   · .claude/rules/ no está ignorado por git: el resto de .claude/ sí lo está.
 *
 * Sin dependencias; necesita Node ≥ 22.5 (path.matchesGlob). Sale con código 1
 * si encuentra algún problema.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_FILE = 'CLAUDE.md';
const RULES_DIR = '.claude/rules';
const ROOT_BUDGET = 40_000;
const CITING_DOCS = ['CLAUDE.md', 'AGENTS.md'];
// Solo se comprueban las rutas que empiezan por una de estas carpetas; las
// relativas a un subproyecto (`tests/setup/env.js`) son ambiguas.
const PATH_PREFIXES = ['api/', 'client/', 'docs/', 'deploy/', 'scripts/', 'openspec/', '.claude/'];

if (typeof path.matchesGlob !== 'function') {
  console.error('Necesita Node ≥ 22.5 (path.matchesGlob).');
  process.exit(2);
}

const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// Ficheros contra los que se evalúan los patrones: los versionados y los nuevos
// no ignorados, que es lo que tendrá cualquier clon. Lo ignorado (node_modules,
// .env) no puede sostener una regla.
const repoFiles = execFileSync(
  'git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: ROOT, encoding: 'utf8' },
).split('\0').filter((f) => f && exists(f));
const repoFileSet = new Set(repoFiles);

// ---------------------------------------------------------------------------
// Utilidades

/** Expande las llaves de un patrón: `a/{b,c}.js` → `a/b.js`, `a/c.js`. */
function expandBraces(pattern) {
  const group = pattern.match(/\{([^{}]*)\}/);
  if (!group) return [pattern];
  const before = pattern.slice(0, group.index);
  const after = pattern.slice(group.index + group[0].length);
  return group[1].split(',').flatMap((alt) => expandBraces(before + alt + after));
}

/** Cuántos ficheros encuentra un patrón ya sin llaves. */
function countMatches(pattern) {
  const wildcard = pattern.search(/[*?]/);
  if (wildcard === -1) return repoFileSet.has(pattern) ? 1 : 0;
  const prefix = pattern.slice(0, wildcard);
  return repoFiles.filter((f) => f.startsWith(prefix) && path.matchesGlob(f, pattern)).length;
}

/**
 * Lee el frontmatter de una regla en la forma exacta que documenta CLAUDE.md.
 * Devuelve la lista de patrones, o null si la forma no es esa.
 */
function parsePaths(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---' || lines[1] !== 'paths:') return null;
  const paths = [];
  let i = 2;
  for (; i < lines.length && lines[i] !== '---'; i++) {
    const item = lines[i].match(/^ {2}- "([^"\\]+)"$/);
    if (!item) return null;
    paths.push(item[1]);
  }
  return i < lines.length && paths.length > 0 ? paths : null;
}

const withoutFences = (text) => text.replace(/^```[\s\S]*?^```/gm, '');

/** Rutas del repositorio citadas en un markdown: en código en línea o en enlaces. */
function citedPaths(text) {
  const prose = withoutFences(text);
  const tokens = [
    ...[...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]),
    ...[...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
  ];
  const cited = new Set();
  for (const token of tokens) {
    const candidate = token.trim().split(/\s/)[0]
      .replace(/#.*$/, '').replace(/:\d+(-\d+)?$/, '').replace(/[.,;:]+$/, '').replace(/\/$/, '');
    if (!PATH_PREFIXES.some((prefix) => candidate.startsWith(prefix))) continue;
    if (/[<>*{}$…]/.test(candidate)) continue; // marcadores y patrones, no rutas
    cited.add(candidate);
  }
  return cited;
}

/** Un `@algo` fuera de código es un import de Claude Code. */
function accidentalImports(text) {
  const prose = withoutFences(text).replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/(^|\s)(@[\w~./-]+)/gm)].map((m) => m[2]);
}

// ---------------------------------------------------------------------------
// CLAUDE.md

const rootText = read(ROOT_FILE);
if (rootText.length > ROOT_BUDGET) {
  fail(ROOT_FILE, `${rootText.length.toLocaleString('es-ES')} caracteres, por encima del presupuesto de ${ROOT_BUDGET.toLocaleString('es-ES')}. Mueve el detalle de un área a su regla.`);
}
for (const imp of accidentalImports(rootText)) {
  fail(ROOT_FILE, `\`${imp}\` fuera de código es un import y se cargaría siempre; ponlo entre comillas invertidas.`);
}

// ---------------------------------------------------------------------------
// Reglas

const ruleFiles = exists(RULES_DIR)
  ? fs.readdirSync(path.join(ROOT, RULES_DIR), { recursive: true })
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.posix.join(RULES_DIR, f.split(path.sep).join('/')))
    .sort()
  : [];
if (ruleFiles.length === 0) fail(RULES_DIR, 'no hay ninguna regla.');

let patternCount = 0;
for (const rule of ruleFiles) {
  const text = read(rule);
  const paths = parsePaths(text);
  if (!paths) {
    fail(rule, 'frontmatter ausente o con otra forma: Claude Code la cargaría en todas las sesiones. Usa la forma exacta de CLAUDE.md.');
    continue;
  }
  for (const pattern of paths) {
    if (pattern.includes('[')) {
      fail(rule, `"${pattern}": un \`[\` abre una clase de caracteres. Cubre las rutas dinámicas de Next con \`**\` desde la carpeta padre.`);
      continue;
    }
    for (const alternative of expandBraces(pattern)) {
      patternCount++;
      if (countMatches(alternative) === 0) {
        fail(rule, `"${alternative}"${alternative === pattern ? '' : ` (de "${pattern}")`} no encuentra ningún fichero: ¿se renombró o se movió?`);
      }
    }
  }
  for (const imp of accidentalImports(text)) {
    fail(rule, `\`${imp}\` fuera de código es un import; ponlo entre comillas invertidas.`);
  }
}

// Las reglas se versionan aunque el resto de .claude/ esté ignorado.
if (ruleFiles.length > 0) {
  try {
    execFileSync('git', ['check-ignore', '-q', ruleFiles[0]], { cwd: ROOT, stdio: 'ignore' });
    fail('.gitignore', `${RULES_DIR}/ está ignorado: las reglas no se versionarían. Debe quedar \`.claude/*\` + \`!.claude/rules/\`.`);
  } catch {
    // `git check-ignore` sale con 1 cuando el fichero NO está ignorado.
  }
}

// ---------------------------------------------------------------------------
// Índice: toda regla aparece en CLAUDE.md, y toda regla citada existe.

const indexed = new Set(rootText.match(/\.claude\/rules\/[\w./-]+?\.md/g) ?? []);
for (const rule of ruleFiles) {
  if (!indexed.has(rule)) fail(ROOT_FILE, `${rule} no figura en «Conocimiento por dominio».`);
}

// ---------------------------------------------------------------------------
// Rutas citadas

let citedCount = 0;
for (const doc of [...CITING_DOCS.filter(exists), ...ruleFiles]) {
  for (const cited of citedPaths(read(doc))) {
    citedCount++;
    if (!exists(cited)) fail(doc, `cita \`${cited}\`, que no existe.`);
  }
}

// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`✗ ${errors.length} problema(s):\n`);
  for (const error of errors) console.error(`  · ${error}`);
  process.exit(1);
}

console.log(`✔ ${ROOT_FILE}: ${rootText.length.toLocaleString('es-ES')} / ${ROOT_BUDGET.toLocaleString('es-ES')} caracteres`);
console.log(`✔ ${ruleFiles.length} reglas, ${patternCount} patrones: todos encuentran ficheros`);
console.log('✔ índice y reglas coinciden');
console.log(`✔ ${citedCount} rutas citadas: todas existen`);
