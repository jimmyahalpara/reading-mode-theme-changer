const vscode = require('vscode');
const crypto = require('crypto');
const { listInstalledThemes } = require('./themes');

const SECTION = 'readingModeTheme';
const VIEW_TYPE = 'readingModeTheme.settings';

/** Read the settings the panel edits, normalised so the webview can rely on the shape. */
function readPanelConfig() {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const groups = (cfg.get('groups') || []).filter((g) => g && typeof g === 'object').map((g) => ({
    name: typeof g.name === 'string' ? g.name : '',
    theme: typeof g.theme === 'string' ? g.theme : '',
    targets: Array.isArray(g.targets) ? g.targets.map(String) : [],
    enabled: g.enabled !== false,
  }));
  return {
    enabled: cfg.get('enabled', true),
    groups,
    fallbackTheme: cfg.get('fallbackTheme', '') || '',
    debounceMs: cfg.get('debounceMs', 400),
  };
}

/** Settings set at workspace / folder level, which win over the user-level values this panel writes. */
function workspaceOverrides() {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return ['enabled', 'groups', 'fallbackTheme', 'debounceMs'].filter((key) => {
    const i = cfg.inspect(key);
    return i && (i.workspaceValue !== undefined || i.workspaceFolderValue !== undefined);
  });
}

class SettingsPanel {
  /** @type {SettingsPanel | undefined} */
  static current;

  /**
   * @param {vscode.ExtensionContext} context
   * @param {() => { tab: object | null, match: object }} getTabStatus
   */
  static show(context, getTabStatus) {
    if (SettingsPanel.current) {
      SettingsPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Reading Mode Theme', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    });
    SettingsPanel.current = new SettingsPanel(panel, context, getTabStatus);
  }

  constructor(panel, context, getTabStatus) {
    this.panel = panel;
    this.getTabStatus = getTabStatus;
    this.writing = false;
    this.disposables = [];

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.svg');
    panel.webview.html = this.html(context);

    panel.onDidDispose(() => this.dispose(), null, this.disposables);
    panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg), null, this.disposables);

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION) && !this.writing) {
        this.post({ type: 'config', config: readPanelConfig(), overrides: workspaceOverrides() });
      }
    }, null, this.disposables);

    vscode.extensions.onDidChange(() => {
      this.post({ type: 'themes', themes: listInstalledThemes() });
    }, null, this.disposables);
  }

  post(msg) {
    this.panel.webview.postMessage(msg);
  }

  /** Called by the extension when the last file tab or its match changes. */
  updateTabStatus() {
    this.post({ type: 'tab', ...this.getTabStatus() });
  }

  async onMessage(msg) {
    switch (msg.type) {
      case 'ready':
        this.post({
          type: 'init',
          config: readPanelConfig(),
          themes: listInstalledThemes(),
          overrides: workspaceOverrides(),
          ...this.getTabStatus(),
        });
        break;
      case 'save':
        await this.save(msg.config);
        break;
      case 'confirmDelete': {
        const label = msg.name ? `"${msg.name}"` : 'this group';
        const answer = await vscode.window.showWarningMessage(
          `Delete ${label}?`,
          { modal: true, detail: 'Its theme and file patterns will be removed from your settings.' },
          'Delete'
        );
        if (answer === 'Delete') this.post({ type: 'deleteConfirmed', index: msg.index });
        break;
      }
      case 'openJson':
        vscode.commands.executeCommand('workbench.action.openSettingsJson', { revealSetting: { key: `${SECTION}.groups` } });
        break;
    }
  }

  /** Write only the keys that changed, at user (global) level. */
  async save(next) {
    const cfg = vscode.workspace.getConfiguration(SECTION);
    const current = readPanelConfig();
    this.writing = true;
    try {
      for (const key of ['enabled', 'groups', 'fallbackTheme', 'debounceMs']) {
        if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) {
          await cfg.update(key, next[key], vscode.ConfigurationTarget.Global);
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Reading Mode Theme: couldn't save settings: ${err.message}`);
      this.post({ type: 'config', config: readPanelConfig(), overrides: workspaceOverrides() });
    } finally {
      this.writing = false;
    }
    this.updateTabStatus();
  }

  html(context) {
    const webview = this.panel.webview;
    const nonce = crypto.randomBytes(16).toString('base64');
    const media = (f) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', f));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${media('settings.css')}">
<title>Reading Mode Theme</title>
</head>
<body>
<main id="app"><p class="muted">Loading…</p></main>
<script nonce="${nonce}" src="${media('settings.js')}"></script>
</body>
</html>`;
  }

  dispose() {
    SettingsPanel.current = undefined;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

module.exports = { SettingsPanel, VIEW_TYPE };
