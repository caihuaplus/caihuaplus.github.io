export function getDiscoveryData(posts) {
  const allUrls = [];
  const byCategory = new Map();

  for (const post of posts) {
    const url = `/blog/${post.data.slug}/`;
    allUrls.push(url);
    const category = post.data.category;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(url);
  }

  const categories = [...byCategory].map(([name, urls]) => ({ name, urls }));
  categories.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return { allUrls, categories };
}

export function pickRandomUrl(urls, random = Math.random) {
  if (urls.length === 0) return undefined;
  return urls[Math.floor(random() * urls.length)];
}
