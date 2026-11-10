// Pure matching logic, kept free of the vscode API so it can be unit-tested with plain Node.

const MODES = ['editor', 'preview', 'any'];

/** Convert a glob (supports *, **, ?, {a,b}) to a case-insensitive RegExp. */
function globToRegExp(glob) {
  let re = '';
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      braceDepth++;
      re += '(?:';
    } else if (c === '}' && braceDepth > 0) {
      braceDepth--;
      re += ')';
    } else if (c === ',' && braceDepth > 0) {
      re += '|';
    } else {
      re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp('^' + re + '$', 'i');
}

/** Parse "pattern[:mode]" into { pattern, mode }. */
function parseTarget(target) {
  const trimmed = String(target).trim();
  const idx = trimmed.lastIndexOf(':');
  if (idx > 0) {
    const mode = trimmed.slice(idx + 1).toLowerCase();
    if (MODES.includes(mode)) {
      return { pattern: trimmed.slice(0, idx), mode };
    }
  }
  return { pattern: trimmed, mode: 'any' };
}

/**
 * @param {{ path?: string, basename: string, mode: 'editor'|'preview' }} tabInfo
 * @param {string} target
 */
function targetMatches(tabInfo, target) {
  const { pattern, mode } = parseTarget(target);
  if (!pattern) return false;
  if (mode !== 'any' && mode !== tabInfo.mode) return false;
  const re = globToRegExp(pattern);
  if (pattern.includes('/')) {
    if (!tabInfo.path) return false;
    const path = tabInfo.path.replace(/\\/g, '/');
    // Allow patterns without a leading ** to match anywhere in the path.
    return re.test(path) || globToRegExp('**/' + pattern).test(path);
  }
  return re.test(tabInfo.basename);
}

/**
 * Pick the theme for a tab. Returns { theme, group, target } where group/target are null on fallback.
 * @param {{ path?: string, basename: string, mode: 'editor'|'preview' } | null} tabInfo
 * @param {Array<{ name?: string, theme: string, targets: string[], enabled?: boolean }>} groups
 * @param {string} fallbackTheme
 */
function resolveTheme(tabInfo, groups, fallbackTheme) {
  if (tabInfo) {
    for (const group of groups || []) {
      if (!group || group.enabled === false || !group.theme || !Array.isArray(group.targets)) continue;
      for (const target of group.targets) {
        if (targetMatches(tabInfo, target)) {
          return { theme: group.theme, group, target };
        }
      }
    }
  }
  return { theme: fallbackTheme, group: null, target: null };
}

/** Get the file name from a webview tab label such as "Preview README.md" or "[Preview] README.md". */
function basenameFromPreviewLabel(label) {
  return String(label).replace(/^\s*\[?preview\]?\s+/i, '').trim();
}

/**
 * Suggest a target for a tab: "*.ext:mode", or the bare file name when it has no extension.
 * @param {{ basename: string, mode: 'editor'|'preview' } | null} tabInfo
 */
function suggestTarget(tabInfo) {
  if (!tabInfo || !tabInfo.basename) return null;
  const dot = tabInfo.basename.lastIndexOf('.');
  const pattern = dot > 0 ? '*' + tabInfo.basename.slice(dot) : tabInfo.basename;
  return `${pattern}:${tabInfo.mode}`;
}

/** Human-readable description of a target, e.g. "*.md — previews only". */
function describeTarget(target) {
  const { pattern, mode } = parseTarget(target);
  const where = { editor: 'text editors only', preview: 'previews only', any: 'editors and previews' }[mode];
  return `${pattern} — ${where}`;
}

module.exports = {
  globToRegExp,
  parseTarget,
  targetMatches,
  resolveTheme,
  basenameFromPreviewLabel,
  suggestTarget,
  describeTarget,
};
