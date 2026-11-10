#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);
const slugPattern = /^[\p{Letter}\p{Number}]+(?:-[\p{Letter}\p{Number}]+)*$/u;
const processor = unified().use(remarkParse).use(remarkStringify, { bullet: '-', fences: true });
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 10);
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);

function fail(source, message) {
  throw new Error(`${source}: ${message}`);
}

function validImage(buffer, ext) {
  if (ext === '.png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (ext === '.jpg' || ext === '.jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (ext === '.gif') return buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a';
  if (ext === '.webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (ext === '.avif') return buffer.toString('ascii', 4, 12).includes('ftypavif') || buffer.toString('ascii', 4, 12).includes('ftypavis');
  return false;
}

async function walkMarkdown(root, dir = root) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) fail(path.relative(root, full), '符号链接不允许出现在博客目录中');
    if (entry.isDirectory()) {
      if (entry.name !== 'assets') files.push(...await walkMarkdown(root, full));
    } else if (entry.name.toLowerCase().endsWith('.md')) files.push(full);
  }
  return files.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function autoSlug(relative) {
  const base = path.basename(relative, path.extname(relative)).normalize('NFKC').toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 70).replace(/-$/g, '');
  return `${base || 'post'}-${sha(relative.normalize('NFC'))}`;
}

function frontmatterFor(post) {
  const fields = {
    title: post.title, description: post.description, pubDate: post.pubDate,
    category: post.category, tags: post.tags, slug: post.slug,
  };
  return `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n`;
}

function parsePost(file, root, raw) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  let parsed;
  try { parsed = matter(raw); } catch { fail(relative, 'Frontmatter 无法解析'); }
  const data = parsed.data;
  if (data.publish === undefined || data.publish === false) return null;
  if (data.publish !== true) fail(relative, 'publish 必须是布尔值 true 或 false');
  for (const name of ['title', 'description', 'category']) {
    if (typeof data[name] !== 'string' || !data[name].trim()) fail(relative, `${name} 必须是非空文字`);
  }
  const date = data.pubDate instanceof Date ? data.pubDate : new Date(data.pubDate);
  if (!data.pubDate || Number.isNaN(date.valueOf())) fail(relative, 'pubDate 必须是有效日期');
  const tags = data.tags ?? [];
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string' || !tag.trim())) fail(relative, 'tags 必须是文字数组');
  const slug = data.slug === undefined ? autoSlug(relative) : data.slug;
  if (typeof slug !== 'string' || !slugPattern.test(slug) || slug.length > 100) fail(relative, 'slug 只能使用字母、数字及中间连字符，最长 100 字符');
  return { file, relative, body: parsed.content, title: data.title.trim(), description: data.description.trim(),
    category: data.category.trim(), pubDate: date.toISOString().slice(0, 10), tags: tags.map((tag) => tag.trim()), slug };
}

function resolvePost(target, current, posts, byPath, byName) {
  const [rawName, heading] = target.split('#', 2);
  if (target.split('#').length > 2 || !rawName.trim()) fail(current.relative, '内部文章引用格式无法安全解析');
  const name = rawName.trim().replace(/\\/g, '/').replace(/\.md$/i, '');
  let found;
  if (name.includes('/')) {
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(current.relative), name));
    found = byPath.get(relative) ?? byPath.get(path.posix.normalize(name));
  } else {
    const candidates = byName.get(name.normalize('NFC')) ?? [];
    if (candidates.length > 1) fail(current.relative, '同名内部文章引用不明确，请使用相对路径');
    found = candidates[0];
  }
  if (!found || !posts.includes(found)) fail(current.relative, '内部链接目标不在公开文章集中');
  const anchor = heading ? `#${encodeURIComponent(heading.trim().toLowerCase().replace(/\s+/g, '-'))}` : '';
  return { url: `/blog/${encodeURIComponent(found.slug)}/${anchor}`, label: found.title };
}

async function resolveImage(reference, current, root) {
  let decoded;
  try { decoded = decodeURIComponent(reference).replace(/\\/g, '/'); } catch { fail(current.relative, '图片路径编码无效'); }
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith('/') || decoded.includes('?') || decoded.includes('#')) fail(current.relative, '图片必须是博客目录内的本地文件');
  const ext = path.extname(decoded).toLowerCase();
  if (!imageExtensions.has(ext)) fail(current.relative, '图片格式不受支持');
  const articleDir = path.dirname(current.file);
  const candidates = decoded.includes('/') ? [path.resolve(articleDir, decoded), path.resolve(root, decoded)] :
    [path.resolve(articleDir, 'assets', decoded), path.resolve(articleDir, decoded)];
  let real;
  for (const candidate of candidates) {
    if (!inside(root, candidate)) continue;
    try { real = await fs.realpath(candidate); break; } catch { /* Try next allowed location. */ }
  }
  if (!real || !inside(root, real)) fail(current.relative, '图片不存在或路径越过博客目录');
  const stat = await fs.stat(real);
  if (!stat.isFile() || stat.size > 15 * 1024 * 1024) fail(current.relative, '图片不是普通文件或超过 15 MB');
  const buffer = await fs.readFile(real);
  if (!validImage(buffer, ext)) fail(current.relative, '图片内容与格式不符');
  return { buffer, ext, name: `${sha(buffer)}${ext}` };
}

async function transformMarkdown(post, context, stage) {
  const tree = processor.parse(post.body);
  const imageDir = path.join(stage, 'assets', post.slug);
  async function visit(node, parent, index) {
    if (node.type === 'html' || node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') fail(post.relative, '原始 HTML 或嵌入语法暂不允许发布');
    if (node.type === 'image') {
      const image = await resolveImage(node.url, post, context.root);
      await fs.mkdir(imageDir, { recursive: true });
      await fs.writeFile(path.join(imageDir, image.name), image.buffer);
      node.url = `./assets/${encodeURIComponent(post.slug)}/${image.name}`;
      return;
    }
    if (node.type === 'link') {
      if (/^(https?:|mailto:|#)/i.test(node.url)) return;
      if (!/\.md(?:#.*)?$/i.test(node.url) && !/^\[\[/.test(node.url)) fail(post.relative, '相对链接格式无法安全解析');
      let decoded;
      try { decoded = decodeURIComponent(node.url); } catch { fail(post.relative, '链接路径编码无效'); }
      node.url = resolvePost(decoded, post, context.posts, context.byPath, context.byName).url;
      return;
    }
    if (node.type === 'text') {
      const value = node.value;
      if (!value.includes('[[') && !value.includes(']]')) return;
      const matches = [...value.matchAll(/(!?)\[\[([^\[\]]+)\]\]/g)];
      if (!matches.length) fail(post.relative, 'WikiLink 格式无法安全解析');
      const replacements = [];
      let cursor = 0;
      for (const match of matches) {
        const before = value.slice(cursor, match.index);
        if (before.includes('[[') || before.includes(']]')) fail(post.relative, 'WikiLink 格式无法安全解析');
        if (before) replacements.push({ type: 'text', value: before });
        const [target, alias] = match[2].split('|', 2);
        if (match[1] === '!') {
          if (!imageExtensions.has(path.extname(target).toLowerCase())) fail(post.relative, '笔记嵌入或不支持的图片格式不能发布');
          const image = await resolveImage(target, post, context.root);
          await fs.mkdir(imageDir, { recursive: true });
          await fs.writeFile(path.join(imageDir, image.name), image.buffer);
          replacements.push({ type: 'image', url: `./assets/${encodeURIComponent(post.slug)}/${image.name}`, alt: alias || path.basename(target) });
        } else {
          const link = resolvePost(target, post, context.posts, context.byPath, context.byName);
          replacements.push({ type: 'link', url: link.url, children: [{ type: 'text', value: alias || link.label }] });
        }
        cursor = match.index + match[0].length;
      }
      const tail = value.slice(cursor);
      if (tail.includes('[[') || tail.includes(']]')) fail(post.relative, 'WikiLink 格式无法安全解析');
      if (tail) replacements.push({ type: 'text', value: tail });
      parent.children.splice(index, 1, ...replacements);
      return replacements.length - 1;
    }
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) i += await visit(node.children[i], node, i) || 0;
    }
  }
  await visit(tree, null, 0);
  return processor.stringify(tree);
}

export async function generate(vault, stage) {
  const requestedRoot = path.resolve(vault, '个人博客');
  let rootStat;
  try { rootStat = await fs.lstat(requestedRoot); } catch { fail('个人博客/', '博客目录尚不存在'); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('个人博客/', '博客目录必须是普通目录');
  const root = await fs.realpath(requestedRoot);
  const files = await walkMarkdown(root);
  const posts = [];
  for (const file of files) {
    const post = parsePost(file, root, await fs.readFile(file, 'utf8'));
    if (post) posts.push(post);
  }
  const byPath = new Map();
  const byName = new Map();
  const slugs = new Map();
  for (const post of posts) {
    if (slugs.has(post.slug)) fail(post.relative, `slug 与 ${slugs.get(post.slug)} 冲突`);
    slugs.set(post.slug, post.relative);
    const noExt = post.relative.replace(/\.md$/i, '');
    byPath.set(noExt, post);
    const name = path.posix.basename(noExt).normalize('NFC');
    byName.set(name, [...(byName.get(name) ?? []), post]);
  }
  const context = { root, posts, byPath, byName };
  await fs.mkdir(stage, { recursive: true });
  for (const post of posts) {
    const body = await transformMarkdown(post, context, stage);
    await fs.writeFile(path.join(stage, `${post.slug}.md`), frontmatterFor(post) + body);
  }
  return { count: posts.length, slugs: posts.map((post) => post.slug) };
}

async function runBuild(project) {
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], { cwd: project, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Astro 构建失败 (${code})`)));
  });
}

export async function publish({ vault, project, build = true }) {
  const contentRoot = path.join(project, 'src/content/blog');
  const target = path.join(contentRoot, 'generated');
  const stage = path.join(contentRoot, `.publish-stage-${process.pid}-${Date.now()}`);
  const backup = path.join(contentRoot, `.publish-backup-${process.pid}-${Date.now()}`);
  const dist = path.join(project, 'dist');
  const distBackup = path.join(project, `.publish-backup-dist-${process.pid}-${Date.now()}`);
  await fs.mkdir(contentRoot, { recursive: true });
  let hadTarget = false;
  let hadDist = false;
  let distPrepared = false;
  let installed = false;
  try {
    const result = await generate(vault, stage);
    try { await fs.rename(target, backup); hadTarget = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(stage, target);
    installed = true;
    if (build) {
      try { await fs.rename(dist, distBackup); hadDist = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      distPrepared = true;
      await runBuild(project);
    }
    if (hadTarget) await fs.rm(backup, { recursive: true, force: true });
    if (hadDist) await fs.rm(distBackup, { recursive: true, force: true });
    return result;
  } catch (error) {
    if (installed) await fs.rm(target, { recursive: true, force: true });
    if (hadTarget) await fs.rename(backup, target);
    if (distPrepared) {
      await fs.rm(dist, { recursive: true, force: true });
      if (hadDist) await fs.rename(distBackup, dist);
    }
    await fs.rm(stage, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const vaultIndex = args.indexOf('--vault');
  const projectIndex = args.indexOf('--project');
  if (vaultIndex < 0 || !args[vaultIndex + 1]) {
    console.error('用法: node scripts/publish-obsidian.mjs --vault <模拟或真实知识库目录> [--project <Astro 项目目录>] [--no-build]');
    process.exitCode = 2;
  } else {
    const project = projectIndex >= 0 ? path.resolve(args[projectIndex + 1]) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    publish({ vault: path.resolve(args[vaultIndex + 1]), project, build: !args.includes('--no-build') })
      .then((result) => console.log(`发布准备完成：${result.count} 篇文章`))
      .catch((error) => { console.error(`发布失败：${error.message}`); process.exitCode = 1; });
  }
}
