import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import { publish } from '../scripts/publish-obsidian.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-description-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const vault = path.join(temp, 'fictional-vault');
  const blog = path.join(vault, '个人博客');
  const project = path.join(temp, 'fictional-site');
  const generated = path.join(project, 'src/content/blog/generated');
  await fs.mkdir(path.join(blog, 'assets'), { recursive: true });
  await fs.writeFile(path.join(blog, 'assets', '只用图片.png'), png);
  return { vault, blog, project, generated, file: path.join(blog, '虚构文章.md') };
}

function source(description, body, publishPost = true) {
  return `---\ntitle: 虚构文章\n${description === undefined ? '' : `description: ${description}\n`}pubDate: 2026-11-13\ncategory: 虚构分类\ntags: [模拟]\nslug: fictional-post\npublish: ${publishPost}\n---\n\n${body}`;
}

async function generatedDescription(f) {
  const output = await fs.readFile(path.join(f.generated, 'fictional-post.md'), 'utf8');
  return matter(output).data.description;
}

test('manual description wins; empty, absent and whitespace values use the first body paragraph', async (t) => {
  const f = await fixture(t);
  const body = '# 虚构标题\n\n第一段虚构正文。\n\n第二段不应被选中。';
  for (const [field, expected] of [
    ['"手写简介"', '手写简介'],
    ['""', '第一段虚构正文。'],
    [undefined, '第一段虚构正文。'],
    ['"   "', '第一段虚构正文。'],
  ]) {
    await fs.writeFile(f.file, source(field, body));
    await publish({ vault: f.vault, project: f.project, build: false });
    assert.equal(await generatedDescription(f), expected);
  }
});

test('skip headings, images, code, rules and link-only paragraphs; flatten inline formatting', async (t) => {
  const f = await fixture(t);
  const body = [
    '# 虚构主标题', '## 小标题', '', '![[只用图片.png]]', '',
    '```js', 'const secret = "不要进入简介";', '```', '', '---', '',
    '[纯链接](https://example.com)', '', 'https://example.com', '',
    '**这一段**有*斜体*，还有[可读链接](https://example.com)与`inline code`。',
  ].join('\n');
  await fs.writeFile(f.file, source('""', body));
  await publish({ vault: f.vault, project: f.project, build: false });
  assert.equal(await generatedDescription(f), '这一段有斜体，还有可读链接与inline code。');
  const output = await fs.readFile(path.join(f.generated, 'fictional-post.md'), 'utf8');
  assert.match(output, /assets\/fictional-post\//);
  assert.doesNotMatch(matter(output).data.description, /只用图片|secret|https:|\*|`/);
});

test('long mixed Chinese, English and emoji text stays within 150 code points and ends naturally when possible', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.file, source('""', `${'这是一段虚构文字'.repeat(13)}。${'后续内容'.repeat(30)}`));
  await publish({ vault: f.vault, project: f.project, build: false });
  const natural = await generatedDescription(f);
  assert.ok(natural.endsWith('。'));
  assert.ok(Array.from(natural).length <= 150);

  await fs.writeFile(f.file, source('""', '中文English😀👩‍🚀'.repeat(30)));
  await publish({ vault: f.vault, project: f.project, build: false });
  const truncated = await generatedDescription(f);
  assert.ok(truncated.endsWith('…'));
  assert.ok(Array.from(truncated).length <= 150);
  assert.doesNotMatch(truncated, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
  assert.doesNotMatch(truncated, /\u200D…$/u);
});

test('missing usable text reports the article and preserves the last successful output', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.file, source('""', '上一版有效正文。'));
  await publish({ vault: f.vault, project: f.project, build: false });
  const before = await fs.readFile(path.join(f.generated, 'fictional-post.md'), 'utf8');
  const noProse = '![[只用图片.png]]\n\n```js\nconst onlyCode = true;\n```\n\n---\n\n[纯链接](https://example.com)';
  await fs.writeFile(f.file, source('""', noProse));
  await assert.rejects(() => publish({ vault: f.vault, project: f.project, build: false }), /虚构文章\.md: description 为空，正文中没有可提取的有效段落/);
  assert.equal(await fs.readFile(path.join(f.generated, 'fictional-post.md'), 'utf8'), before);
});

test('auto description follows edits, then a manual description overrides it without changing the source', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.file, source('""', '原来的虚构开头。'));
  await publish({ vault: f.vault, project: f.project, build: false });
  assert.equal(await generatedDescription(f), '原来的虚构开头。');

  await fs.writeFile(f.file, source('""', '修改后的虚构开头。'));
  await publish({ vault: f.vault, project: f.project, build: false });
  assert.equal(await generatedDescription(f), '修改后的虚构开头。');

  const manual = source('"后来手写的简介"', '修改后的虚构开头。');
  await fs.writeFile(f.file, manual);
  await publish({ vault: f.vault, project: f.project, build: false });
  assert.equal(await generatedDescription(f), '后来手写的简介');
  assert.equal(await fs.readFile(f.file, 'utf8'), manual);
});

test('an unpublished draft without description never blocks another published article', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.file, source('""', '允许公开的虚构正文。'));
  await fs.writeFile(path.join(f.blog, '未发布草稿.md'), source(undefined, '![[不存在.png]]', false));
  assert.equal((await publish({ vault: f.vault, project: f.project, build: false })).count, 1);
  assert.equal(await generatedDescription(f), '允许公开的虚构正文。');
  assert.deepEqual((await fs.readdir(f.generated)).filter((name) => name.endsWith('.md')), ['fictional-post.md']);
});
