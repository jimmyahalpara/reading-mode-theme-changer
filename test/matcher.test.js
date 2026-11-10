const test = require('node:test');
const assert = require('node:assert/strict');
const {
  globToRegExp,
  parseTarget,
  targetMatches,
  resolveTheme,
  basenameFromPreviewLabel,
  suggestTarget,
} = require('../src/matcher');

test('globToRegExp: *, ?, **, braces, case-insensitive', () => {
  assert.ok(globToRegExp('*.md').test('README.md'));
  assert.ok(globToRegExp('*.md').test('notes.MD'));
  assert.ok(!globToRegExp('*.md').test('a/b.md'));
  assert.ok(globToRegExp('?.txt').test('a.txt'));
  assert.ok(!globToRegExp('?.txt').test('ab.txt'));
  assert.ok(globToRegExp('*.{md,txt}').test('a.txt'));
  assert.ok(!globToRegExp('*.{md,txt}').test('a.js'));
  assert.ok(globToRegExp('**/docs/*.md').test('docs/a.md'));
  assert.ok(globToRegExp('**/docs/*.md').test('x/y/docs/a.md'));
  assert.ok(globToRegExp('docs/**').test('docs/a/b/c.md'));
  assert.ok(globToRegExp('file.name+(1).md').test('file.name+(1).md'));
  assert.ok(!globToRegExp('a.md').test('aXmd'));
});

test('parseTarget: mode suffix', () => {
  assert.deepEqual(parseTarget('*.md:preview'), { pattern: '*.md', mode: 'preview' });
  assert.deepEqual(parseTarget(' *.md:EDITOR '), { pattern: '*.md', mode: 'editor' });
  assert.deepEqual(parseTarget('*.md'), { pattern: '*.md', mode: 'any' });
  assert.deepEqual(parseTarget('C:/x/*.md'), { pattern: 'C:/x/*.md', mode: 'any' });
  assert.deepEqual(parseTarget('*.md:bogus'), { pattern: '*.md:bogus', mode: 'any' });
});

test('targetMatches: mode filter and basename vs path', () => {
  const preview = { path: '/home/u/proj/docs/README.md', basename: 'README.md', mode: 'preview' };
  const editor = { ...preview, mode: 'editor' };
  assert.ok(targetMatches(preview, '*.md:preview'));
  assert.ok(!targetMatches(editor, '*.md:preview'));
  assert.ok(targetMatches(editor, '*.md'));
  assert.ok(targetMatches(editor, '*.md:any'));
  assert.ok(targetMatches(editor, 'docs/*.md'));
  assert.ok(targetMatches(editor, '**/proj/**'));
  assert.ok(!targetMatches(editor, 'src/*.md'));
  assert.ok(!targetMatches(editor, ''));
});

test('targetMatches: path patterns need a path (webview previews have none)', () => {
  const webview = { basename: 'README.md', mode: 'preview' };
  assert.ok(targetMatches(webview, '*.md:preview'));
  assert.ok(!targetMatches(webview, 'docs/*.md'));
});

test('targetMatches: Windows-style separators are normalised', () => {
  const tab = { path: 'C:\\proj\\docs\\a.md', basename: 'a.md', mode: 'editor' };
  assert.ok(targetMatches(tab, 'docs/*.md'));
});

test('resolveTheme: first matching group wins, disabled/invalid groups skipped', () => {
  const groups = [
    { name: 'off', theme: 'T0', targets: ['*.md'], enabled: false },
    { name: 'broken', targets: ['*.md'] },
    { name: 'previews', theme: 'T1', targets: ['*.md:preview'] },
    { name: 'markdown', theme: 'T2', targets: ['*.md'] },
  ];
  const r1 = resolveTheme({ basename: 'a.md', mode: 'preview' }, groups, 'F');
  assert.equal(r1.theme, 'T1');
  assert.equal(r1.group.name, 'previews');
  assert.equal(r1.target, '*.md:preview');

  const r2 = resolveTheme({ basename: 'a.md', mode: 'editor' }, groups, 'F');
  assert.equal(r2.theme, 'T2');
});

test('resolveTheme: fallback when nothing matches or no tab', () => {
  const groups = [{ theme: 'T1', targets: ['*.md'] }];
  assert.deepEqual(resolveTheme({ basename: 'a.js', mode: 'editor' }, groups, 'F'), {
    theme: 'F',
    group: null,
    target: null,
  });
  assert.equal(resolveTheme(null, groups, 'F').theme, 'F');
  assert.equal(resolveTheme({ basename: 'a.js', mode: 'editor' }, undefined, '').theme, '');
});

test('basenameFromPreviewLabel', () => {
  assert.equal(basenameFromPreviewLabel('Preview README.md'), 'README.md');
  assert.equal(basenameFromPreviewLabel('[Preview] README.md'), 'README.md');
  assert.equal(basenameFromPreviewLabel('README.md'), 'README.md');
});

test('suggestTarget', () => {
  assert.equal(suggestTarget({ basename: 'README.md', mode: 'preview' }), '*.md:preview');
  assert.equal(suggestTarget({ basename: 'archive.tar.gz', mode: 'editor' }), '*.gz:editor');
  assert.equal(suggestTarget({ basename: 'Makefile', mode: 'editor' }), 'Makefile:editor');
  assert.equal(suggestTarget({ basename: '.gitignore', mode: 'editor' }), '.gitignore:editor');
  assert.equal(suggestTarget(null), null);
});

test('suggested targets match the tab they were made from', () => {
  for (const tab of [
    { basename: 'README.md', mode: 'preview' },
    { basename: 'Makefile', mode: 'editor' },
    { basename: '.gitignore', mode: 'editor' },
  ]) {
    assert.ok(targetMatches(tab, suggestTarget(tab)), suggestTarget(tab));
  }
});
