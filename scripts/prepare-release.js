#!/usr/bin/env node
// Decide the next release version, update package.json and CHANGELOG.md, and report it to GitHub Actions.
//
//  - If the version in package.json has no git tag yet (first release, or a version you set by hand),
//    that version is released as-is.
//  - Otherwise the version is bumped based on the commits since the last tag:
//    "#major" or "#minor" anywhere in a commit message picks that bump; anything else is a patch.
//  - If there are no new commits since the last tag, nothing is released.
//
// Usage: node scripts/prepare-release.js [--dry-run]
// Outputs (to $GITHUB_OUTPUT when set): release=true|false, version=X.Y.Z, tag=vX.Y.Z

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tagExists(tag) {
  return git('tag', '--list', tag) === tag;
}

function lastTag() {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*');
  } catch {
    return null;
  }
}

function bump(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Commits since `from` (or all commits), excluding merges and earlier release commits. */
function commitsSince(from) {
  const range = from ? [`${from}..HEAD`] : ['HEAD'];
  const raw = git('log', ...range, '--no-merges', '--format=%s%x1f%b%x1e');
  return raw
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject, body = ''] = entry.split('\x1f');
      return { subject: subject.trim(), body: body.trim() };
    })
    .filter((c) => !/^Release v\d/.test(c.subject));
}

function changelogEntry(version, commits) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = commits
    .map((c) => c.subject.replace(/\s*#(major|minor|patch)\b/gi, '').replace(/\s*\[skip ci\]/gi, '').trim())
    .filter(Boolean)
    .map((s) => `- ${s}`);
  return `## ${version} (${date})\n\n${lines.length ? lines.join('\n') : '- Maintenance release.'}\n`;
}

function insertChangelog(text, entry) {
  // Insert above the first existing "## " section, keeping the header intact.
  const idx = text.search(/^## /m);
  if (idx === -1) return `${text.trimEnd()}\n\n${entry}`;
  return `${text.slice(0, idx)}${entry}\n${text.slice(idx)}`;
}

function setOutput(values) {
  for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`);
  if (process.env.GITHUB_OUTPUT && !dryRun) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
  }
}

function main() {
  const pkgPath = path.join(root, 'package.json');
  const changelogPath = path.join(root, 'CHANGELOG.md');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const current = pkg.version;
  const previousTag = lastTag();

  let version;
  let commits;
  if (!tagExists(`v${current}`)) {
    version = current;
    commits = commitsSince(previousTag);
  } else {
    commits = commitsSince(`v${current}`);
    if (commits.length === 0) {
      console.log(`No new commits since v${current}; nothing to release.`);
      setOutput({ release: 'false', version: current, tag: `v${current}` });
      return;
    }
    const text = commits.map((c) => `${c.subject}\n${c.body}`).join('\n');
    const kind = /#major\b/i.test(text) ? 'major' : /#minor\b/i.test(text) ? 'minor' : 'patch';
    version = bump(current, kind);
    console.log(`Bumping ${current} -> ${version} (${kind})`);
  }

  if (tagExists(`v${version}`)) {
    throw new Error(`Tag v${version} already exists; set a higher version in package.json.`);
  }

  if (!dryRun) {
    if (version !== current) {
      pkg.version = version;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      const lockPath = path.join(root, 'package-lock.json');
      if (fs.existsSync(lockPath)) {
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        lock.version = version;
        if (lock.packages && lock.packages['']) lock.packages[''].version = version;
        fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
      }
    }
    const changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '# Changelog\n';
    const hasEntry = new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`, 'm').test(changelog);
    if (!hasEntry) fs.writeFileSync(changelogPath, insertChangelog(changelog, changelogEntry(version, commits)));
  }

  setOutput({ release: 'true', version, tag: `v${version}` });
}

main();
