# Changelog

All notable changes to this extension are documented here.

## 0.1.0

First release.

- Switch the color theme automatically based on the active tab, using user-defined groups of file patterns.
- Scope each pattern to previews, text editors, or both.
- Fallback theme for tabs that match no group.
- Settings panel for creating, reordering, enabling/disabling and deleting groups, and for choosing themes from those installed.
- Status bar item that shows the matched group.
- Commands: Open Settings, Add Active File Type to a Group, Toggle Automatic Theme Switching, Show How the Active Tab Is Matched.
- Debounced switching, to avoid flicker when moving between previews.
