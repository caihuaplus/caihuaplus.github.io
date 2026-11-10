# 部署与发布

## 发布流程

文章在 Obsidian 知识库的 `个人博客/` 目录中编写。Obsidian Git 将更改推送到私有仓库的 `main` 后，私有仓库的发布工作流只提取这个目录内明确设置 `publish: true` 的文章，以及这些文章实际引用的本地图片。转换与构建通过后，工作流更新本仓库的 `src/content/blog/generated/`。本仓库的 [Pages 工作流](../.github/workflows/deploy.yml) 随后构建 Astro 站点并部署到 [GitHub Pages](https://caihuaplus.github.io/)。

Pages 的发布来源应设置为 **GitHub Actions**。公开仓库中的 `generated/` 由工作流维护，不要手动编辑。

## 编写文章

在 `个人博客/` 下新建 Markdown 文件。建议先保持 `publish: false`，确认正文和图片适合公开后再改为 `true`：

```md
---
title: 我的第一篇文章
description: 文章简介
pubDate: 2026-11-11
category: 生活
tags: [记录]
slug: my-first-post
publish: false
---

正文可以引用 [[另一篇公开文章]] 和 ![[图片.png]]。
```

`title`、`description`、`pubDate`、`category` 必填；`tags` 可省略。只有布尔值 `publish: true` 会公开。`slug` 可省略，但建议在首次发布前填写并保持不变；例如 `my-first-post` 对应 `/blog/my-first-post/`。未填写时，地址根据文件名和路径生成，移动或重命名文件会改变地址。重复的 `slug` 会使发布失败。

支持文章 WikiLinks、本地图片引用、标准 Markdown 图片和指向已公开文章的相对 `.md` 链接。同名文章的 WikiLink 有歧义时，应使用相对路径。图片须位于 `个人博客/` 内；支持 PNG、JPEG、GIF、WebP 和 AVIF，单张不超过 15 MB。未发布文章的链接、笔记嵌入、越界路径、远程图片和原始 HTML 会阻止该次发布。发布前也要检查图片内容和元数据。

修改已发布文章后，下次同步会更新网站；将 `publish` 改为 `false` 或删除源文件，会从当前网站移除文章和不再使用的图片。已经公开的内容仍可能保留在 Git 历史、搜索引擎或缓存中。

## 本地检查

在本仓库运行：

```sh
npm ci
npm test
npm run build
```

需要检查转换结果时，指定要读取的知识库目录：

```sh
npm run publish:local -- --vault /path/to/vault
```

转换器只读取指定知识库的 `个人博客/`，生成结果写到本仓库的 `src/content/blog/generated/`。它会在转换失败或本地构建失败时恢复上一次有效结果。运行前确认所指定的目录正确，且不要将未审阅的生成内容提交到公开仓库。

## 凭据和维护

跨仓库推送使用私有仓库的 GitHub Actions Secret `BLOG_PUBLISH_TOKEN`。对应的细粒度 Token 只需选中**本公开仓库**，授予 **Contents: Read and write**；不需要将 Token 写入文件或日志。Token 到期时，创建同等权限的新 Token，在私有仓库的 **Settings → Secrets and variables → Actions** 中更新这个 Secret，再重新运行失败的发布工作流。

私有发布工作流使用固定的转换器提交。若将来修改本仓库的转换程序，需要先完成测试，再更新私有工作流固定的提交号；仅更新公开仓库代码不会自动改变私有工作流使用的转换器版本。

## 故障处理与回滚

- **私有工作流的 `extract` 失败：**检查文章 Frontmatter、图片路径、内部链接和转换错误。未通过校验的内容不会推送到公开仓库。
- **私有工作流的 `publish` 失败：**检查 Astro 测试和构建输出、`BLOG_PUBLISH_TOKEN` 是否过期，以及公开仓库 `main` 是否有远端冲突。工作流不会强制推送；先解决冲突再重跑。
- **公开仓库的 Pages 工作流失败：**查看 [Actions 运行记录](https://github.com/caihuaplus/caihuaplus.github.io/actions/workflows/deploy.yml)。上一次成功部署的网站会继续提供服务。
- **需要回滚：**在公开仓库恢复上一条正常的站点提交并重新部署，同时修正 Obsidian 中的源文章，避免后续同步再次发布错误内容。

排查时先确认 Obsidian Git 已将更改推送到私有仓库的 `main`，再依次查看私有发布工作流和公开 Pages 工作流。
