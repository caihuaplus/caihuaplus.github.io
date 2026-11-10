# 个人博客

独立的 Astro 静态博客。文章仍在 Obsidian 知识库中写作；本项目的转换器只读取知识库 `个人博客/`，仅发布明确设置 `publish: true` 的 Markdown 和其引用的本地图片。

## 本地开发

要求 Node.js 22 或更新版本。

```sh
npm ci
npm run dev
```

浏览 `http://localhost:4321/`。构建与预览：

```sh
npm run build
npm run preview
```

自动测试：`npm test`。测试使用临时模拟知识库，不读取真实 Obsidian 笔记。

## 写文章

在私人知识库中创建 `个人博客/文章名.md`，图片可放在文章旁的 `assets/`。示例：

```md
---
title: 我的第一篇文章
description: 文章简介
pubDate: 2026-11-10
category: 生活
tags: [记录]
slug: my-first-post
publish: false
---

正文可以使用 [[另一篇公开文章]] 和 ![[图片.png]]。
```

只有布尔值 `publish: true` 会发布。缺少 `publish` 或设为 `false` 都不发布。`title`、`description`、`pubDate`、`category` 必填；`tags` 可选。发布后把 `publish` 改回 `false` 或删除源文件，下次转换会移除当前网站对应页面和图片。

`slug` 可选，推荐发布前填写，例如 `zhenhuan-review` 对应 `/blog/zhenhuan-review/`。未填写时使用「文件名加短路径哈希」，例如 `/blog/我的第一篇文章-a1b2c3d4e5/`；中文地址会在浏览器中按 URL 标准编码。同名文件可共存。改文章标题不会改变地址；**修改 `slug`、移动或重命名未设置 `slug` 的文件会改变地址**。GitHub Pages 不提供动态重定向，因此已发布文章应固定 `slug`，并避免再改。重复 `slug` 会使转换失败。

## 本地转换

仅在确认知识库路径后运行：

```sh
npm run publish:local -- --vault /path/to/obsidian-vault
```

转换程序只读 `vault/个人博客/`，写入本项目的 `src/content/blog/generated/`。它先生成临时目录、校验全部引用，再替换生成目录并执行 Astro 构建。解析或构建失败会恢复上一次生成结果与本地 `dist/`。不要手动编辑 `generated/`，否则下次转换会覆盖这些改动。

支持文章 WikiLinks `[[文章]]`、`[[文章|显示文字]]`、本地图片 `![[图片.png]]`、标准 Markdown 图片和指向已公开文章的相对 `.md` 链接。相同文件名的 WikiLinks 如有歧义，须写相对路径。图片必须位于 `个人博客/` 内，且实际存在；仅复制实际引用的 PNG、JPEG、GIF、WebP、AVIF，最大 15 MB。SVG、远程图片、笔记嵌入、私人文章链接、越界路径和原始 HTML 在第一版会报错并停止发布。图片原始字节会公开；发布前请检查图片内容与元数据。

## GitHub Pages（下一阶段）

计划在公开仓库 `caihuaplus/caihuaplus.github.io` 中保存本项目源码，在私有仓库增加最小发布工作流。公开仓库 Pages 来源设为 **GitHub Actions**，部署使用 Astro 官方 Action；私有工作流将以只对该公开仓库具有 Contents 写权限的细粒度 Token 推送已验证的生成目录。Token 存在私有仓库 Actions Secret 中，不能写入源码、命令输出或日志。**本地阶段尚未添加工作流、Secret，也未首次推送。**

Token 到期时，在 GitHub 中创建同等最小权限的新 Token，更新私有仓库对应 Secret，然后手动重跑失败的发布工作流；无需更改文章或 Obsidian Git 配置。

## 回滚与故障处理

- 转换报错：根据报出的博客内源文件修正 Frontmatter、链接或图片；转换失败不会替换上次成功的生成目录。
- 构建失败：本地转换器会恢复上次生成目录；检查 `npm run build` 输出。未来的 GitHub 工作流应在提交前先构建，失败时不推送。
- 远端推送冲突：未来工作流须从公开仓库最新 `main` 重建并非强制推送，不能覆盖人工修改。
- 需要回滚已发布网站：在公开仓库恢复上一条已成功部署的提交并重新运行 Pages 部署；随后修正 Obsidian 源文，避免下次同步再次发布错误版本。
- Token 失效：更新私有仓库 Secret 后重跑；上一次成功部署的网站仍可访问。

撤回文章只会从当前网站移除；已经公开的内容仍可能留在 Git 历史、搜索引擎和缓存中。首次将 `publish` 设为 `true` 前应逐篇审阅正文及图片。
