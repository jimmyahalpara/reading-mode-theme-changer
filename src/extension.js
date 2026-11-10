const vscode = require('vscode');
const path = require('path');
const { resolveTheme, basenameFromPreviewLabel } = require('./matcher');

const SECTION = 'readingModeTheme';

let timer = null;
const warnedThemes = new Set();

/**
 * Describe the active tab as { path?, basename, mode } or return null when it isn't a file-like tab
 * (terminal, settings UI, no tab open, ...).
 */
function describeActiveTab() {
  const tab = vscode.window.tabGroups.activeTabGroup?.activeTab;
  if (!tab) return null;
  const input = tab.input;

  const fromUri = (uri, mode) => ({ path: uri.path, basename: path.posix.basename(uri.path), mode });

  if (input instanceof vscode.TabInputText) return fromUri(input.uri, 'editor');
  if (input instanceof vscode.TabInputTextDiff) return fromUri(input.modified, 'editor');
  if (input instanceof vscode.TabInputNotebook) return fromUri(input.uri, 'editor');
  if (vscode.TabInputNotebookDiff && input instanceof vscode.TabInputNotebookDiff) {
    return fromUri(input.modified, 'editor');
  }
  // `*.md` opened with vscode.markdown.preview.editor shows up as a custom editor.
  if (input instanceof vscode.TabInputCustom) return fromUri(input.uri, 'preview');
  // "Open Preview" / "Open Preview to the Side" shows up as a webview labelled e.g. "Preview README.md".
  if (input instanceof vscode.TabInputWebview) {
    return { basename: basenameFromPreviewLabel(tab.label), mode: 'preview' };
  }
  return null;
}

function readConfig() {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    enabled: cfg.get('enabled', true),
    groups: cfg.get('groups', []),
    fallbackTheme: cfg.get('fallbackTheme', ''),
    debounceMs: Math.max(0, Number(cfg.get('debounceMs', 400)) || 0),
  };
}

/** Theme names usable in workbench.colorTheme: a theme's `id`, or its `label` when it has no id. */
function installedThemeNames() {
  const names = new Set();
  for (const ext of vscode.extensions.all) {
    const themes = ext.packageJSON?.contributes?.themes;
    if (!Array.isArray(themes)) continue;
    for (const t of themes) {
      if (t.id) names.add(t.id);
      if (t.label) names.add(t.label);
    }
  }
  return names;
}

async function applyTheme() {
  const config = readConfig();
  if (!config.enabled) return;

  const { theme } = resolveTheme(describeActiveTab(), config.groups, config.fallbackTheme);
  if (!theme) return;

  const workbench = vscode.workspace.getConfiguration('workbench');
  if (workbench.get('colorTheme') === theme) return;

  if (!installedThemeNames().has(theme)) {
    if (!warnedThemes.has(theme)) {
      warnedThemes.add(theme);
      vscode.window.showWarningMessage(
        `Reading Mode Theme: the theme "${theme}" isn't installed. Check readingModeTheme settings.`
      );
    }
    return;
  }

  try {
    await workbench.update('colorTheme', theme, vscode.ConfigurationTarget.Global);
  } catch (err) {
    vscode.window.showErrorMessage(`Reading Mode Theme: couldn't switch to "${theme}": ${err.message}`);
  }
}

function scheduleApply() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    applyTheme();
  }, readConfig().debounceMs);
}

async function toggle() {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const next = !cfg.get('enabled', true);
  await cfg.update('enabled', next, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(
    `Reading Mode Theme: automatic switching ${next ? 'enabled' : 'disabled'}.`
  );
}

function showActiveTab() {
  const config = readConfig();
  const info = describeActiveTab();
  const { theme, group, target } = resolveTheme(info, config.groups, config.fallbackTheme);

  const tabText = info
    ? `${info.basename} (${info.mode})${info.path ? ` — ${info.path}` : ''}`
    : 'not a file tab';
  const matchText = group
    ? `group "${group.name || '(unnamed)'}" via target "${target}"`
    : 'no group matched, using fallback';
  const themeText = theme || '(none — theme left unchanged)';
  const state = config.enabled ? '' : ' [switching is disabled]';

  vscode.window.showInformationMessage(
    `Active tab: ${tabText}. Match: ${matchText}. Theme: ${themeText}.${state}`
  );
}

function activate(context) {
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(scheduleApply),
    vscode.window.tabGroups.onDidChangeTabGroups(scheduleApply),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        warnedThemes.clear();
        scheduleApply();
      }
    }),
    vscode.extensions.onDidChange(() => warnedThemes.clear()),
    vscode.commands.registerCommand(`${SECTION}.toggle`, toggle),
    vscode.commands.registerCommand(`${SECTION}.showActiveTab`, showActiveTab),
    { dispose: () => timer && clearTimeout(timer) }
  );
  scheduleApply();
}

function deactivate() {
  if (timer) clearTimeout(timer);
}

module.exports = { activate, deactivate };
