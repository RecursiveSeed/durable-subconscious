// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import { safeProjectPath } from './subconscious-lib.mjs';

// Read-only lexical discovery over already-curated module nodes. It never
// evaluates project code, imports project runtime, or infers semantic authority.
export function discover(files, { root = process.cwd(), forbiddenPathSegments = [] } = {}) {
  const imports = [], apiStrings = [], unresolved = [];
  for (const rel of [...new Set(files)].sort()) {
    const full = safeProjectPath(root, rel, { forbiddenPathSegments });
    if (!full || !/\.(m?js|cjs|html|css)$/.test(rel) || !fs.existsSync(full)) {
      unresolved.push({ file: rel, reason: 'not an eligible existing source file' });
      continue;
    }
    const text = fs.readFileSync(full, 'utf8');
    const lineAt = offset => text.slice(0, offset).split('\n').length;
    const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'](\.[^"']+)["']/g;
    for (const match of text.matchAll(re)) {
      const target = path.relative(root, path.resolve(path.dirname(full), match[1])).replace(/\\/g, '/');
      if (!safeProjectPath(root, target, { forbiddenPathSegments })) {
        unresolved.push({ file: rel, reason: 'out-of-scope import', line: lineAt(match.index) });
        continue;
      }
      if (!fs.existsSync(path.resolve(root, target))) {
        unresolved.push({ file: rel, target, reason: 'literal import missing', line: lineAt(match.index) });
        continue;
      }
      imports.push({ file: rel, target, line: lineAt(match.index) });
    }
    for (const match of text.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)) {
      const expression = match[1].trim();
      if (!/^(?:["']\.[^"']+["'])$/.test(expression)) {
        unresolved.push({ file: rel, reason: 'dynamic or nonliteral import requires review', line: lineAt(match.index) });
      }
    }
    for (const match of text.matchAll(/\brequire\s*\(\s*([^)]*)\)/g)) {
      const expression = match[1].trim();
      if (!/^(?:["']\.[^"']+["'])$/.test(expression)) {
        unresolved.push({ file: rel, reason: 'dynamic or nonliteral require requires review', line: lineAt(match.index) });
      }
    }
    for (const match of text.matchAll(/["'`]((?:\/api\/)[a-zA-Z0-9_./:-]+)/g)) {
      apiStrings.push({ file: rel, route: match[1], line: lineAt(match.index), interpretation: 'literal API string only; declaration/call/authorization not inferred' });
    }
  }
  return { method: 'literal relative imports and API strings; comments/dynamic expressions may need review', imports, apiStrings, unresolved };
}
