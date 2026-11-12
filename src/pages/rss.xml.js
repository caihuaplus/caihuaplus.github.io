import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
import { newestFirst } from '../utils/post-order.mjs';

export async function GET(context) {
  const posts = (await getCollection('blog')).sort(newestFirst);
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    items: posts.map((post) => ({ title: post.data.title, description: post.data.description, pubDate: post.data.pubDate, link: `/blog/${post.data.slug}/` })),
    customData: '<language>zh-CN</language>',
  });
}
