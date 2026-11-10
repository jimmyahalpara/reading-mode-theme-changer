# Reading Mode Theme Changer

Switch VS Code's color theme automatically depending on what you're looking at. You decide which files get which theme.

The extension ships with no themes and no rules, so nothing changes until you create a group.

## How it works

You create **groups**. Each group has:

- a **theme**: any color theme you have installed
- one or more **file patterns**, such as `*.md` or `*.{txt,rst}`
- for each pattern, **where** it applies: in previews, in text editors, or both

Whenever the active tab changes, groups are checked from top to bottom. The first group with a matching pattern decides the theme. If no group matches, the **fallback theme** is used. If the fallback is empty, the theme is left alone.

## Getting started

1. Run **Reading Mode Theme: Open Settings** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`), or click the status bar item.
2. Click **+ New group**, give it a name, and choose a theme.
3. Add file patterns, and choose whether each applies to previews, text editors, or both.
4. Optionally choose a **fallback theme** for tabs that match no group.

Open a matching file and the theme follows.

**Shortcut:** with a file or preview open, run **Reading Mode Theme: Add Active File Type to a Group…** to add its file type to an existing group, or to a new one.

## Patterns

| Pattern | Matches |
| --- | --- |
| `*.md` | any file ending in `.md` |
| `*.{md,txt,rst}` | `.md`, `.txt` or `.rst` files |
| `README*` | `README`, `README.md`, `README.txt`, … |
| `docs/**` | anything inside a `docs` folder |
| `**/notes/*.md` | `.md` files directly inside any `notes` folder |

- `*` matches within a name, `**` matches across folders, `?` matches one character, and `{a,b}` matches either option.
- Patterns without a `/` match the **file name**. Patterns with a `/` match the **path**.
- Matching is case-insensitive.

Append a **scope** to choose where a pattern applies (the settings panel does this for you):

| Suffix | Applies to |
| --- | --- |
| `:preview` | previews: Markdown previews and files opened with a custom editor |
| `:editor` | text editors, diff editors and notebooks |
| `:any` or nothing | both |

## Settings

Everything can be edited in the settings panel. For reference, these are the underlying settings:

| Setting | Default | Description |
| --- | --- | --- |
| `readingModeTheme.enabled` | `true` | Turn automatic switching on or off. |
| `readingModeTheme.groups` | `[]` | The groups, in priority order. |
| `readingModeTheme.fallbackTheme` | `""` | Theme used when no group matches. Leave empty to keep the current theme. |
| `readingModeTheme.debounceMs` | `400` | Delay before switching after a tab change, to avoid flicker. |
| `readingModeTheme.showStatusBarItem` | `true` | Show the matched group in the status bar. |

Example `settings.json` (the theme names are placeholders; use themes you have installed):

```jsonc
"readingModeTheme.groups": [
  {
    "name": "Reading",
    "theme": "<your light theme>",
    "targets": ["*.md:preview", "*.{txt,rst}:editor"],
    "enabled": true
  },
  {
    "name": "Docs folder",
    "theme": "<another theme>",
    "targets": ["docs/**"]
  }
],
"readingModeTheme.fallbackTheme": "<your usual theme>"
```

## Commands

| Command | What it does |
| --- | --- |
| Reading Mode Theme: Open Settings | Opens the settings panel. |
| Reading Mode Theme: Add Active File Type to a Group… | Adds the active tab's file type, with its scope, to a group. |
| Reading Mode Theme: Toggle Automatic Theme Switching | Turns switching on or off. |
| Reading Mode Theme: Show How the Active Tab Is Matched | Explains which group, pattern and theme apply to the active tab. |

## Notes

- The theme is changed by updating `workbench.colorTheme` in your **user** settings. If you use Settings Sync, that value syncs like any other theme change.
- If a workspace sets `workbench.colorTheme` itself, that workspace value takes priority, and VS Code will show the workspace theme.
- Previews opened with **Open Preview** don't expose a file path, so path patterns (those containing `/`) can't match them. Name patterns like `*.md` work fine.
- Themes that aren't installed are skipped with a one-time warning.

## License

[MIT](LICENSE)
