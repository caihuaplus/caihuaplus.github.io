import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publish } from '../scripts/publish-obsidian.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
const frontmatter = (extra = '') => `---\ntitle: 我的第一篇文章\ndescription: 一篇模拟文章\npubDate: 2026-11-10\ncategory: 生活\ntags: [记录]\n${extra}---\n\n`;

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-publish-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const vault = path.join(temp, 'vault');
  const blog = path.join(vault, '个人博客');
  const project = path.join(temp, 'site');
  const generated = path.join(project, 'src/content/blog/generated');
  await fs.mkdir(path.join(blog, 'assets'), { recursive: true });
  await fs.mkdir(generated, { recursive: true });
  await fs.writeFile(path.join(vault, '私人文件.md'), '绝不公开的模拟内容');
  await fs.writeFile(path.join(blog, 'assets', '中文 图片.png'), png);
  await fs.writeFile(path.join(blog, 'assets', '未引用.png'), png);
  return { vault, blog, project, generated };
}

test('默认不发布；发布、更新、撤回、删除只影响生成目录', async (t) => {
  const f = await fixture(t);
  const file = path.join(f.blog, '我的第一篇文章.md');
  const second = path.join(f.blog, '第二篇.md');
  const draft = frontmatter('publish: false\n') + '# 标题\n';
  await fs.writeFile(file, draft);
  assert.equal((await publish({ vault: f.vault, project: f.project, build: false })).count, 0);
  assert.deepEqual(await fs.readdir(f.generated), []);
  await fs.writeFile(second, frontmatter('slug: second-post\npublish: true\n').replace('title: 我的第一篇文章', 'title: 第二篇') + '# 第二篇\n');
  const published = frontmatter('slug: first-post\npublish: true\n') + '# 一级标题\n\n## 二级标题\n\n- 列表\n\n![[中文 图片.png]]\n\n![另一种写法](assets/中文%20图片.png)\n\n[[第二篇|读第二篇]]\n\n[标准链接](第二篇.md)\n';
  await fs.writeFile(file, published);
  assert.equal((await publish({ vault: f.vault, project: f.project, build: false })).count, 2);
  const output = await fs.readFile(path.join(f.generated, 'first-post.md'), 'utf8');
  assert.match(output, /\/blog\/second-post\//);
  assert.match(output, /assets\/first-post\//);
  assert.doesNotMatch(output, /!\[\[/);
  assert.equal(await fs.readFile(file, 'utf8'), published);
  assert.equal((await fs.readdir(path.join(f.generated, 'assets', 'first-post'))).length, 1);
  assert.doesNotMatch(JSON.stringify(await fs.readdir(f.generated)), /未引用|私人文件/);
  const oldImage = (await fs.readdir(path.join(f.generated, 'assets', 'first-post')))[0];
  await fs.writeFile(path.join(f.blog, 'assets', '中文 图片.png'), Buffer.concat([png, Buffer.from('image-update')]));
  await publish({ vault: f.vault, project: f.project, build: false });
  const newImage = (await fs.readdir(path.join(f.generated, 'assets', 'first-post')))[0];
  assert.notEqual(newImage, oldImage);
  await fs.writeFile(file, published.replace('一级标题', '修改后的标题'));
  await publish({ vault: f.vault, project: f.project, build: false });
  assert.match(await fs.readFile(path.join(f.generated, 'first-post.md'), 'utf8'), /修改后的标题/);
  await fs.writeFile(file, draft);
  await publish({ vault: f.vault, project: f.project, build: false });
  assert.deepEqual((await fs.readdir(f.generated)).filter((name) => name.endsWith('.md')), ['second-post.md']);
  await fs.rm(second);
  await publish({ vault: f.vault, project: f.project, build: false });
  assert.deepEqual(await fs.readdir(f.generated), []);
});

test('转换失败保留上次成功的内容', async (t) => {
  const f = await fixture(t);
  const file = path.join(f.blog, '文章.md');
  await fs.writeFile(file, frontmatter('slug: safe-post\npublish: true\n') + '正常正文');
  await publish({ vault: f.vault, project: f.project, build: false });
  const before = await fs.readFile(path.join(f.generated, 'safe-post.md'), 'utf8');
  await fs.mkdir(path.join(f.project, 'dist'));
  await fs.writeFile(path.join(f.project, 'dist', 'index.html'), '有效网站');
  await fs.writeFile(file, frontmatter('slug: safe-post\npublish: true\n') + '![[不存在.png]]');
  await assert.rejects(() => publish({ vault: f.vault, project: f.project, build: true }), /图片不存在/);
  assert.equal(await fs.readFile(path.join(f.generated, 'safe-post.md'), 'utf8'), before);
  assert.equal(await fs.readFile(path.join(f.project, 'dist', 'index.html'), 'utf8'), '有效网站');
});

test('私人链接、slug 冲突与路径越界均拒绝发布', async (t) => {
  const f = await fixture(t);
  const first = path.join(f.blog, '一.md');
  const second = path.join(f.blog, '二.md');
  await fs.writeFile(first, frontmatter('slug: same\npublish: true\n') + '[[私人文件]]');
  await assert.rejects(() => publish({ vault: f.vault, project: f.project, build: false }), /不在公开文章集中/);
  await fs.writeFile(first, frontmatter('slug: same\npublish: true\n') + '![](../../私人图片.png)');
  await assert.rejects(() => publish({ vault: f.vault, project: f.project, build: false }), /越过博客目录/);
  await fs.writeFile(first, frontmatter('slug: same\npublish: true\n') + '正常');
  await fs.writeFile(second, frontmatter('slug: same\npublish: true\n') + '重复');
  await assert.rejects(() => publish({ vault: f.vault, project: f.project, build: false }), /slug .*冲突/);
});

test('中文同名文章的自动 slug 不冲突，发布后的标题变更不改变 URL', async (t) => {
  const f = await fixture(t);
  for (const dir of ['生活', '读书']) {
    await fs.mkdir(path.join(f.blog, dir));
    await fs.writeFile(path.join(f.blog, dir, '随想.md'), frontmatter('publish: true\n') + '正文');
  }
  const result = await publish({ vault: f.vault, project: f.project, build: false });
  assert.equal(result.count, 2);
  assert.equal(new Set(result.slugs).size, 2);
  assert.ok(result.slugs.every((slug) => slug.startsWith('随想-')));
});

test('Astro 构建失败时恢复上一次生成结果', async (t) => {
  const f = await fixture(t);
  const file = path.join(f.blog, '文章.md');
  await fs.writeFile(file, frontmatter('slug: stable\npublish: true\n') + '旧内容');
  await publish({ vault: f.vault, project: f.project, build: false });
  const old = await fs.readFile(path.join(f.generated, 'stable.md'), 'utf8');
  await fs.mkdir(path.join(f.project, 'dist'));
  await fs.writeFile(path.join(f.project, 'dist', 'index.html'), '上次成功的网站');
  await fs.writeFile(file, frontmatter('slug: stable\npublish: true\n') + '新内容');
  await fs.writeFile(path.join(f.project, 'package.json'), '{"scripts":{"build":"exit 1"}}');
  await assert.rejects(() => publish({ vault: f.vault, project: f.project, build: true }), /构建失败/);
  assert.equal(await fs.readFile(path.join(f.generated, 'stable.md'), 'utf8'), old);
  assert.equal(await fs.readFile(path.join(f.project, 'dist', 'index.html'), 'utf8'), '上次成功的网站');
});

test('符号链接不能把博客目录外的笔记或图片带入公开结果', async (t) => {
  const f = await fixture(t);
  const file = path.join(f.blog, '安全文章.md');
  const source = frontmatter('slug: safe\npublish: true\n') + '原始内容';
  await fs.writeFile(file, source);
  await publish({ vault: f.vault, project: f.project, build: false });
  const before = await fs.readFile(path.join(f.generated, 'safe.md'), 'utf8');
  const noteLink = path.join(f.blog, '伪装笔记.md');
  await fs.symlink(path.join(f.vault, '私人文件.md'), noteLink);
  await assert.rejects(() => publish({ vault: f.vault, project: f.project, build: false }), /符号链接/);
  await fs.rm(noteLink);
  await fs.writeFile(path.join(f.vault, '私人图片.png'), png);
  await fs.symlink(path.join(f.vault, '私人图片.png'), path.join(f.blog, 'assets', '偷取.png'));
  await fs.writeFile(file, frontmatter('slug: safe\npublish: true\n') + '![[偷取.png]]');
  await assert.rejects(() => publish({ vault: f.vault, project: f.project, build: false }), /越过博客目录/);
  assert.equal(await fs.readFile(path.join(f.generated, 'safe.md'), 'utf8'), before);
  assert.deepEqual((await fs.readdir(f.generated)).filter((name) => name.endsWith('.md')), ['safe.md']);
});
