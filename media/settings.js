// Webview script for the Reading Mode Theme settings panel.
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');

  /** @type {{ config: any, themes: any[], tab: any, match: any, overrides: string[] } | null} */
  let state = null;
  let saveTimer = null;

  const MODES = [
    { value: 'preview', label: 'Previews only' },
    { value: 'editor', label: 'Text editors only' },
    { value: 'any', label: 'Editors and previews' },
  ];

  // ---------- helpers ----------

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function parseTarget(target) {
    const t = String(target).trim();
    const i = t.lastIndexOf(':');
    if (i > 0) {
      const mode = t.slice(i + 1).toLowerCase();
      if (mode === 'editor' || mode === 'preview' || mode === 'any') return { pattern: t.slice(0, i), mode };
    }
    return { pattern: t, mode: 'any' };
  }

  function formatTarget(pattern, mode) {
    return mode === 'any' ? pattern : `${pattern}:${mode}`;
  }

  function modeLabel(mode) {
    return { preview: 'previews', editor: 'editors', any: 'editors + previews' }[mode];
  }

  function isInstalled(name) {
    return state.themes.some((t) => t.name === name);
  }

  /** Save now (selects, checkboxes, structural edits) or shortly (typing). */
  function save(delay = 0) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => vscode.postMessage({ type: 'save', config: state.config }), delay);
  }

  function update(mutator, { rerender = true, delay = 0 } = {}) {
    mutator(state.config);
    save(delay);
    if (rerender) render();
  }

  function themeSelect(value, onChange, { allowNone, noneLabel } = {}) {
    const byKind = new Map();
    for (const t of state.themes) {
      const kind = t.kind || 'Other';
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(t);
    }
    const options = [];
    if (allowNone) options.push(h('option', { value: '' }, noneLabel));
    else if (!value) options.push(h('option', { value: '', disabled: true }, 'Choose a theme…'));
    if (value && !isInstalled(value)) options.push(h('option', { value }, `${value} (not installed)`));
    const kindOrder = ['Light', 'Dark', 'High Contrast Light', 'High Contrast Dark', 'Other'];
    for (const kind of kindOrder) {
      const list = byKind.get(kind);
      if (!list) continue;
      options.push(h('optgroup', { label: kind }, list.map((t) => h('option', { value: t.name, title: t.extension }, t.name))));
    }
    const sel = h('select', { onChange: (e) => onChange(e.target.value) }, options);
    sel.value = value || '';
    return sel;
  }

  // ---------- sections ----------

  function renderHeader() {
    const c = state.config;
    return h('header', { class: 'top' },
      h('div', {},
        h('h1', {}, 'Reading Mode Theme'),
        h('p', { class: 'muted' }, 'Switch the color theme automatically depending on what kind of tab is active. Groups are checked top to bottom; the first one with a matching file pattern decides the theme.')
      ),
      h('label', { class: 'switch' },
        h('input', { type: 'checkbox', checked: c.enabled, onChange: (e) => update((cfg) => { cfg.enabled = e.target.checked; }) }),
        h('span', {}, c.enabled ? 'Automatic switching is on' : 'Automatic switching is off')
      )
    );
  }

  function renderOverrides() {
    if (!state.overrides || state.overrides.length === 0) return null;
    return h('div', { class: 'notice warn' },
      `This workspace overrides: ${state.overrides.map((k) => 'readingModeTheme.' + k).join(', ')}. `,
      'The panel edits your user settings, so those values won\'t take effect here until the workspace setting is removed.'
    );
  }

  function renderStatus() {
    const { tab, match } = state;
    let body;
    if (!tab) {
      body = h('span', { class: 'muted' }, 'Open a file or preview, then come back here to see which group it matches.');
    } else {
      const where = tab.mode === 'preview' ? 'preview' : 'text editor';
      const result = match && match.groupName !== null
        ? h('span', {}, ' matches ', h('strong', {}, match.groupName || `group ${match.groupIndex + 1}`), ' via ', h('code', {}, match.target), ' → ', h('strong', {}, match.theme))
        : h('span', {}, ' matches no group → ', match && match.theme ? h('strong', {}, `${match.theme} (fallback)`) : h('em', {}, 'theme left unchanged'));
      body = h('span', {}, 'Last file: ', h('code', {}, tab.basename), ` (${where})`, result);
    }
    return h('section', { class: 'status' }, body);
  }

  function renderGlobal() {
    const c = state.config;
    return h('section', { class: 'card' },
      h('h2', {}, 'Defaults'),
      h('div', { class: 'row' },
        h('label', { class: 'field' },
          h('span', { class: 'label' }, 'Fallback theme'),
          h('span', { class: 'muted small' }, 'Used when no group matches the active tab.'),
          themeSelect(c.fallbackTheme, (v) => update((cfg) => { cfg.fallbackTheme = v; }), { allowNone: true, noneLabel: 'Keep the current theme' })
        ),
        h('label', { class: 'field narrow' },
          h('span', { class: 'label' }, 'Delay (ms)'),
          h('span', { class: 'muted small' }, 'Wait before switching, to avoid flicker.'),
          h('input', {
            type: 'number', min: '0', step: '50', value: String(c.debounceMs),
            onChange: (e) => update((cfg) => { cfg.debounceMs = Math.max(0, Number(e.target.value) || 0); }, { rerender: false }),
          })
        )
      )
    );
  }

  function renderGroup(group, index) {
    const groups = state.config.groups;
    const problems = [];
    if (!group.theme) problems.push('Choose a theme for this group.');
    else if (!isInstalled(group.theme)) problems.push(`"${group.theme}" isn't installed.`);
    if (group.targets.length === 0) problems.push('Add at least one file pattern.');

    const patternInput = h('input', { type: 'text', placeholder: 'e.g. *.md, *.{txt,rst}, docs/**', class: 'grow' });
    const modeSelect = h('select', {}, MODES.map((m) => h('option', { value: m.value }, m.label)));
    modeSelect.value = 'preview';

    const addTarget = () => {
      const pattern = patternInput.value.trim();
      if (!pattern) { patternInput.focus(); return; }
      const target = formatTarget(pattern, modeSelect.value);
      update((cfg) => {
        const t = cfg.groups[index].targets;
        if (!t.includes(target)) t.push(target);
      });
      const again = app.querySelectorAll('.group')[index]?.querySelector('input.grow');
      if (again) again.focus();
    };
    patternInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTarget(); });

    const suggestion = state.tab && state.tab.suggestedTarget;
    const canSuggest = suggestion && !group.targets.includes(suggestion);

    return h('section', { class: 'card group' + (group.enabled ? '' : ' disabled') },
      h('div', { class: 'group-head' },
        h('input', {
          type: 'text', class: 'name', value: group.name, placeholder: `Group ${index + 1}`,
          'aria-label': 'Group name',
          onChange: (e) => update((cfg) => { cfg.groups[index].name = e.target.value; }, { rerender: false }),
        }),
        h('label', { class: 'switch small', title: 'Enable or disable this group' },
          h('input', { type: 'checkbox', checked: group.enabled, onChange: (e) => update((cfg) => { cfg.groups[index].enabled = e.target.checked; }) }),
          h('span', {}, group.enabled ? 'On' : 'Off')
        ),
        h('div', { class: 'icons' },
          h('button', { class: 'icon', title: 'Move up', 'aria-label': 'Move up', disabled: index === 0,
            onClick: () => update((cfg) => { const g = cfg.groups; [g[index - 1], g[index]] = [g[index], g[index - 1]]; }) }, '↑'),
          h('button', { class: 'icon', title: 'Move down', 'aria-label': 'Move down', disabled: index === groups.length - 1,
            onClick: () => update((cfg) => { const g = cfg.groups; [g[index + 1], g[index]] = [g[index], g[index + 1]]; }) }, '↓'),
          h('button', { class: 'icon danger', title: 'Delete group', 'aria-label': 'Delete group',
            onClick: () => vscode.postMessage({ type: 'confirmDelete', index, name: group.name }) }, '✕')
        )
      ),
      h('label', { class: 'field' },
        h('span', { class: 'label' }, 'Theme'),
        themeSelect(group.theme, (v) => update((cfg) => { cfg.groups[index].theme = v; }))
      ),
      h('div', { class: 'field' },
        h('span', { class: 'label' }, 'File patterns'),
        group.targets.length
          ? h('ul', { class: 'chips' }, group.targets.map((target, ti) => {
              const { pattern, mode } = parseTarget(target);
              return h('li', { class: 'chip' },
                h('code', {}, pattern),
                h('span', { class: 'mode mode-' + mode }, modeLabel(mode)),
                h('button', { class: 'icon', title: 'Remove', 'aria-label': `Remove ${target}`,
                  onClick: () => update((cfg) => { cfg.groups[index].targets.splice(ti, 1); }) }, '✕')
              );
            }))
          : h('p', { class: 'muted small' }, 'No patterns yet.'),
        h('div', { class: 'row add' },
          patternInput,
          modeSelect,
          h('button', { class: 'secondary', onClick: addTarget }, 'Add')
        ),
        canSuggest
          ? h('button', { class: 'link', onClick: () => update((cfg) => { cfg.groups[index].targets.push(suggestion); }) },
              `+ Add the last file's type (${suggestion.replace(/:(editor|preview|any)$/, '')}, ${modeLabel(parseTarget(suggestion).mode)})`)
          : null
      ),
      problems.length ? h('div', { class: 'notice warn small' }, problems.join(' ')) : null
    );
  }

  function renderGroups() {
    const groups = state.config.groups;
    return h('section', {},
      h('div', { class: 'section-head' },
        h('h2', {}, 'Groups'),
        h('button', { class: 'primary', onClick: () => {
          update((cfg) => { cfg.groups.push({ name: '', theme: '', targets: [], enabled: true }); });
          const names = app.querySelectorAll('.group input.name');
          names[names.length - 1]?.focus();
        } }, '+ New group')
      ),
      groups.length
        ? groups.map(renderGroup)
        : h('div', { class: 'card empty' },
            h('p', {}, 'No groups yet.'),
            h('p', { class: 'muted' }, 'A group pairs a theme with file patterns, for example a light theme for ', h('code', {}, '*.md'), ' previews.'))
    );
  }

  function renderFooter() {
    return h('footer', {},
      h('span', { class: 'muted small' }, 'Changes are saved to your user settings automatically. Pattern syntax: ', h('code', {}, '*'), ' ', h('code', {}, '**'), ' ', h('code', {}, '?'), ' ', h('code', {}, '{a,b}'), '. Patterns without a ', h('code', {}, '/'), ' match the file name; patterns with one match the path. '),
      h('button', { class: 'link', onClick: () => vscode.postMessage({ type: 'openJson' }) }, 'Open settings.json')
    );
  }

  function render() {
    if (!state) return;
    const scroll = window.scrollY;
    app.replaceChildren(renderHeader(), renderOverrides() || '', renderStatus(), renderGlobal(), renderGroups(), renderFooter());
    window.scrollTo(0, scroll);
  }

  // ---------- messages ----------

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
        state = { config: msg.config, themes: msg.themes, tab: msg.tab, match: msg.match, overrides: msg.overrides };
        render();
        break;
      case 'config':
        if (!state) return;
        state.overrides = msg.overrides;
        if (JSON.stringify(msg.config) !== JSON.stringify(state.config)) {
          state.config = msg.config;
          render();
        }
        break;
      case 'themes':
        if (!state) return;
        state.themes = msg.themes;
        render();
        break;
      case 'tab':
        if (!state) return;
        state.tab = msg.tab;
        state.match = msg.match;
        // Only refresh the status line and suggestions; avoid stealing focus from an input being edited.
        if (!document.activeElement || document.activeElement === document.body || document.activeElement.tagName === 'BUTTON') render();
        else app.querySelector('.status')?.replaceWith(renderStatus());
        break;
      case 'deleteConfirmed':
        update((cfg) => { cfg.groups.splice(msg.index, 1); });
        break;
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
