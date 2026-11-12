import test from 'node:test';
import assert from 'node:assert/strict';
import { oldestFirst, newestFirst } from '../src/utils/post-order.mjs';

const post = (slug, pubDate) => ({ data: { slug, pubDate: new Date(pubDate) } });

test('文章按发布日期排序，同一天按 slug 固定排序', () => {
  const posts = [
    post('z-last', '2026-11-12'),
    post('older', '2026-11-11'),
    post('a-first', '2026-11-12'),
  ];
  assert.deepEqual([...posts].sort(oldestFirst).map((item) => item.data.slug), ['older', 'a-first', 'z-last']);
  assert.deepEqual([...posts].sort(newestFirst).map((item) => item.data.slug), ['a-first', 'z-last', 'older']);
});
