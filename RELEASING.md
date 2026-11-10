# Releasing

Releases are fully automatic. Every push to `main` that changes the extension runs [release.yml](.github/workflows/release.yml), which:

1. runs the unit tests,
2. picks the version (see below) and adds a CHANGELOG entry built from the commit messages,
3. packages the extension and publishes it to the Visual Studio Marketplace, and to Open VSX if `OVSX_PAT` is set,
4. commits the new version, tags it `vX.Y.Z`, and creates a GitHub Release with the `.vsix` attached.

Pushes that only touch `test/`, `.github/`, `.vscode/` or `.gitignore` don't release. Pull requests run [ci.yml](.github/workflows/ci.yml): tests plus a packaging check.

## Choosing the version

| You do | Result |
| --- | --- |
| Push normally | patch bump (`0.1.3` → `0.1.4`) |
| Put `#minor` in a commit message | minor bump (`0.1.3` → `0.2.0`) |
| Put `#major` in a commit message | major bump (`0.1.3` → `1.0.0`) |
| Set `"version"` in `package.json` yourself | that exact version is released |

If you write a `## X.Y.Z` section in `CHANGELOG.md` yourself, it is kept and no entry is generated.

## Required repository secrets

Settings → Secrets and variables → Actions:

| Secret | Required | What it is |
| --- | --- | --- |
| `VSCE_PAT` | yes | Azure DevOps personal access token with the **Marketplace → Manage** scope, for publisher `jimmyahalpara` |
| `OVSX_PAT` | no | Open VSX access token; publishing there is skipped when unset |

If `main` is protected, allow `github-actions[bot]` to push to it, because the workflow commits the version bump.
