/**
 * The public collection already contains only generated, approved articles.
 * Slugs are ASCII and unique, so code-point order is stable across runtimes.
 */
const compareSlug = (a, b) => a.data.slug < b.data.slug ? -1 : a.data.slug > b.data.slug ? 1 : 0;

export const oldestFirst = (a, b) =>
  a.data.pubDate.valueOf() - b.data.pubDate.valueOf() || compareSlug(a, b);

export const newestFirst = (a, b) =>
  b.data.pubDate.valueOf() - a.data.pubDate.valueOf() || compareSlug(a, b);
