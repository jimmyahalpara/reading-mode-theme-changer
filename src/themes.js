const vscode = require('vscode');

/**
 * Installed color themes, as the names `workbench.colorTheme` accepts (a theme's `id`, or its `label`
 * when it has no id). Labels that are unresolved localisation keys like "%foo%" are skipped.
 * @returns {Array<{ name: string, kind: string, extension: string }>}
 */
function listInstalledThemes() {
  const seen = new Map();
  for (const ext of vscode.extensions.all) {
    const pkg = ext.packageJSON || {};
    const themes = pkg.contributes?.themes;
    if (!Array.isArray(themes)) continue;
    for (const t of themes) {
      const name = t.id || t.label;
      if (!name || /^%.*%$/.test(name) || seen.has(name)) continue;
      seen.set(name, {
        name,
        kind: themeKind(t.uiTheme),
        extension: pkg.displayName && !/^%.*%$/.test(pkg.displayName) ? pkg.displayName : ext.id,
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every theme declares one of VS Code's four fixed base types in its `uiTheme` field. These are not
 * theme names — we only use them to group the (dynamically discovered) theme list under headings in pickers.
 */
function themeKind(uiTheme) {
  switch (uiTheme) {
    case 'vs': return 'Light';
    case 'vs-dark': return 'Dark';
    case 'hc-black': return 'High Contrast Dark';
    case 'hc-light': return 'High Contrast Light';
    default: return '';
  }
}

function isThemeInstalled(name) {
  return listInstalledThemes().some((t) => t.name === name);
}

module.exports = { listInstalledThemes, isThemeInstalled };
