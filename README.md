# 采花的个人博客

记录生活、读书、影视、技术学习和独立开发项目。

博客使用 Astro 构建，部署在 GitHub Pages：[caihuaplus.github.io](https://caihuaplus.github.io/)。文章用 Markdown 在 Obsidian 中写作，发布后的文章和图片由工作流同步到本仓库。网站提供文章分类、标签和 [RSS](https://caihuaplus.github.io/rss.xml)。

## 本地运行

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run dev
```

打开 `http://localhost:4321/`。检查正式构建时运行：

```sh
npm run build
npm run preview
```

文章发布、部署和故障处理见 [部署与发布说明](docs/deployment.md)。
