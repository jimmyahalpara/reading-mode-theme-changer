const vscode = require('vscode');
const path = require('path');
const { resolveTheme, basenameFromPreviewLabel, suggestTarget } = require('./matcher');
const { listInstalledThemes, isThemeInstalled } = require('./themes');
const { SettingsPanel, VIEW_TYPE } = require('./settingsPanel');

const SECTION = 'readingModeTheme';
const SELF = Symbol('settings-panel');

let timer = null;
let statusItem = null;
/** The last tab that was a file (editor or preview), so the settings panel can refer to it. */
let lastFileTab = null;
const warnedThemes = new Set();

// ---------- tab classification ----------

/**
 * Describe a tab as { path?, basename, mode }, SELF for this extension's own settings panel,
 * or null when it isn't a file-like tab (terminal, settings UI, ...).
 */
function describeTab(tab) {
  if (!tab) return null;
  const input = tab.input;
  const fromUri = (uri, mode) => ({ path: uri.path, basename: path.posix.basename(uri.path), mode });

  if (input instanceof vscode.TabInputText) return fromUri(input.uri, 'editor');
  if (input instanceof vscode.TabInputTextDiff) return fromUri(input.modified, 'editor');
  if (input instanceof vscode.TabInputNotebook) return fromUri(input.uri, 'editor');
  if (vscode.TabInputNotebookDiff && input instanceof vscode.TabInputNotebookDiff) {
    return fromUri(input.modified, 'editor');
  }
  // Files opened with a custom editor (e.g. "*.md" associated with vscode.markdown.preview.editor).
  if (input instanceof vscode.TabInputCustom) return fromUri(input.uri, 'preview');
  if (input instanceof vscode.TabInputWebview) {
    if (input.viewType.includes(VIEW_TYPE)) return SELF;
    // "Open Preview" / "Open Preview to the Side" — labelled like "Preview README.md".
    return { basename: basenameFromPreviewLabel(tab.label), mode: 'preview' };
  }
  return null;
}

function activeTab() {
  return vscode.window.tabGroups.activeTabGroup?.activeTab;
}

// ---------- configuration ----------

function readConfig() {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    enabled: cfg.get('enabled', true),
    groups: cfg.get('groups', []),
    fallbackTheme: cfg.get('fallbackTheme', '') || '',
    debounceMs: Math.max(0, Number(cfg.get('debounceMs', 400)) || 0),
    showStatusBarItem: cfg.get('showStatusBarItem', true),
  };
}

/** What the settings panel shows about the last file tab. */
function tabStatus() {
  const config = readConfig();
  if (!lastFileTab) return { tab: null, match: null };
  const r = resolveTheme(lastFileTab, config.groups, config.fallbackTheme);
  const groupIndex = r.group ? config.groups.indexOf(r.group) : -1;
  return {
    tab: { basename: lastFileTab.basename, mode: lastFileTab.mode, path: lastFileTab.path, suggestedTarget: suggestTarget(lastFileTab) },
    match: { theme: r.theme, target: r.target, groupIndex, groupName: r.group ? r.group.name || '' : null },
  };
}

// ---------- theme switching ----------

async function applyTheme() {
  const info = describeTab(activeTab());
  if (info === SELF) return; // Don't change themes while the user is in our own settings panel.
  if (info) lastFileTab = info;
  SettingsPanel.current?.updateTabStatus();

  const config = readConfig();
  const result = resolveTheme(info, config.groups, config.fallbackTheme);
  updateStatusItem(config, info, result);
  if (!config.enabled || !result.theme) return;

  const workbench = vscode.workspace.getConfiguration('workbench');
  if (workbench.get('colorTheme') === result.theme) return;

  if (!isThemeInstalled(result.theme)) {
    if (!warnedThemes.has(result.theme)) {
      warnedThemes.add(result.theme);
      const where = result.group ? `group "${result.group.name || 'unnamed'}"` : 'the fallback theme';
      vscode.window
        .showWarningMessage(`Reading Mode Theme: "${result.theme}" (${where}) isn't installed.`, 'Open Settings')
        .then((choice) => choice && vscode.commands.executeCommand(`${SECTION}.openSettings`));
    }
    return;
  }

  try {
    await workbench.update('colorTheme', result.theme, vscode.ConfigurationTarget.Global);
  } catch (err) {
    vscode.window.showErrorMessage(`Reading Mode Theme: couldn't switch to "${result.theme}": ${err.message}`);
  }
}

function scheduleApply(delay) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    applyTheme();
  }, delay ?? readConfig().debounceMs);
}

// ---------- status bar ----------

function updateStatusItem(config, info, result) {
  if (!statusItem) return;
  if (!config.showStatusBarItem) {
    statusItem.hide();
    return;
  }
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = { enabledCommands: [`${SECTION}.openSettings`, `${SECTION}.toggle`] };
  if (!config.enabled) {
    statusItem.text = '$(circle-slash) Reading Theme';
    md.appendMarkdown('**Reading Mode Theme** — automatic switching is off.\n\n');
  } else if (!Array.isArray(config.groups) || config.groups.length === 0) {
    statusItem.text = '$(color-mode) Reading Theme';
    md.appendMarkdown('**Reading Mode Theme** — no groups yet. Create one to start switching themes.\n\n');
  } else {
    const label = result.group ? result.group.name || 'Unnamed group' : 'Fallback';
    statusItem.text = `$(color-mode) ${label}`;
    md.appendMarkdown(`**Reading Mode Theme**\n\n`);
    if (info) md.appendMarkdown(`Active: \`${info.basename}\` (${info.mode})\n\n`);
    md.appendMarkdown(
      result.group
        ? `Matched \`${result.target}\` → **${result.theme}**\n\n`
        : result.theme
          ? `No group matched → **${result.theme}** (fallback)\n\n`
          : 'No group matched; theme left unchanged.\n\n'
    );
  }
  md.appendMarkdown(`[Open Settings](command:${SECTION}.openSettings) · [${config.enabled ? 'Turn Off' : 'Turn On'}](command:${SECTION}.toggle)`);
  statusItem.tooltip = md;
  statusItem.show();
}

// ---------- commands ----------

async function toggle() {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const next = !cfg.get('enabled', true);
  await cfg.update('enabled', next, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage(`Reading Mode Theme: automatic switching ${next ? 'on' : 'off'}`, 3000);
}

function showActiveTab() {
  const config = readConfig();
  const info = describeTab(activeTab());
  if (info === SELF || !info) {
    vscode.window.showInformationMessage('Reading Mode Theme: the active tab is not a file or preview, so the fallback theme applies.');
    return;
  }
  const { theme, group, target } = resolveTheme(info, config.groups, config.fallbackTheme);
  const where = info.mode === 'preview' ? 'preview' : 'text editor';
  const match = group ? `matches group "${group.name || 'unnamed'}" via "${target}"` : 'matches no group';
  const outcome = theme ? `theme: ${theme}${group ? '' : ' (fallback)'}` : 'theme left unchanged';
  const off = config.enabled ? '' : ' Automatic switching is currently off.';
  vscode.window
    .showInformationMessage(`${info.basename} (${where}) ${match}; ${outcome}.${off}`, 'Open Settings')
    .then((choice) => choice && vscode.commands.executeCommand(`${SECTION}.openSettings`));
}

async function pickTheme(placeHolder) {
  const items = listInstalledThemes().map((t) => ({ label: t.name, description: t.kind, detail: t.extension }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true, matchOnDetail: true });
  return picked?.label;
}

async function addActiveTabToGroup() {
  const info = describeTab(activeTab());
  const tab = info && info !== SELF ? info : lastFileTab;
  const target = suggestTarget(tab);
  if (!target) {
    vscode.window.showInformationMessage('Reading Mode Theme: open a file or preview first.');
    return;
  }

  const cfg = vscode.workspace.getConfiguration(SECTION);
  const groups = (cfg.get('groups') || []).map((g) => ({ ...g, targets: [...(g.targets || [])] }));
  const NEW = '$(add) New group…';
  const items = [
    ...groups.map((g, i) => ({
      label: g.name || `Group ${i + 1}`,
      description: g.theme || 'no theme',
      detail: (g.targets || []).join(', ') || 'no patterns',
      index: i,
    })),
    { label: NEW, index: -1, alwaysShow: true },
  ];
  const picked = await vscode.window.showQuickPick(items, { placeHolder: `Add "${target}" to which group?` });
  if (!picked) return;

  if (picked.index === -1) {
    const name = await vscode.window.showInputBox({ prompt: 'Name for the new group', placeHolder: 'e.g. Reading' });
    if (name === undefined) return;
    const theme = await pickTheme(`Theme for "${name || 'new group'}"`);
    if (!theme) return;
    groups.push({ name, theme, targets: [target], enabled: true });
  } else {
    const g = groups[picked.index];
    if (g.targets.includes(target)) {
      vscode.window.showInformationMessage(`"${target}" is already in "${picked.label}".`);
      return;
    }
    g.targets.push(target);
  }
  await cfg.update('groups', groups, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage(`Reading Mode Theme: added ${target}`, 3000);
}

// ---------- lifecycle ----------

function activate(context) {
  statusItem = vscode.window.createStatusBarItem(`${SECTION}.status`, vscode.StatusBarAlignment.Right, 100);
  statusItem.name = 'Reading Mode Theme';
  statusItem.command = `${SECTION}.openSettings`;

  context.subscriptions.push(
    statusItem,
    vscode.window.tabGroups.onDidChangeTabs(() => scheduleApply()),
    vscode.window.tabGroups.onDidChangeTabGroups(() => scheduleApply()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        warnedThemes.clear();
        scheduleApply(0);
      }
    }),
    vscode.extensions.onDidChange(() => warnedThemes.clear()),
    vscode.commands.registerCommand(`${SECTION}.openSettings`, () => SettingsPanel.show(context, tabStatus)),
    vscode.commands.registerCommand(`${SECTION}.toggle`, toggle),
    vscode.commands.registerCommand(`${SECTION}.showActiveTab`, showActiveTab),
    vscode.commands.registerCommand(`${SECTION}.addActiveTabToGroup`, addActiveTabToGroup),
    { dispose: () => timer && clearTimeout(timer) }
  );
  scheduleApply(0);
}

function deactivate() {
  if (timer) clearTimeout(timer);
}

module.exports = { activate, deactivate };
