import assert from 'node:assert/strict';
import test from 'node:test';
import { getDiscoveryData, pickRandomUrl } from '../src/utils/random-discovery.mjs';

const post = (slug, category) => ({ data: { slug, category } });

test('empty and single-category collections cannot show discovery', () => {
  assert.equal(getDiscoveryData([]).categories.length, 0);
  assert.equal(getDiscoveryData([post('one', '生活'), post('two', '生活')]).categories.length, 1);
});

test('two or more categories contain only their current public article URLs', () => {
  const initial = [post('first', '生活'), post('second', '阅读'), post('third', '生活'), post('fourth', '手作')];
  const { allUrls, categories } = getDiscoveryData(initial);
  assert.deepEqual(allUrls, ['/blog/first/', '/blog/second/', '/blog/third/', '/blog/fourth/']);
  assert.equal(categories.length, 3);
  assert.deepEqual(categories.find(({ name }) => name === '生活').urls, ['/blog/first/', '/blog/third/']);
  assert.deepEqual(categories.find(({ name }) => name === '阅读').urls, ['/blog/second/']);

  const afterWithdrawal = getDiscoveryData(initial.filter(({ data }) => data.slug !== 'third'));
  assert.ok(!afterWithdrawal.allUrls.includes('/blog/third/'));
  assert.deepEqual(afterWithdrawal.categories.find(({ name }) => name === '生活').urls, ['/blog/first/']);

  const afterDeletion = getDiscoveryData(initial.filter(({ data }) => !['third', 'fourth'].includes(data.slug)));
  assert.equal(afterDeletion.categories.length, 2);
  assert.ok(!afterDeletion.allUrls.includes('/blog/fourth/'));
});

test('each click can select a different valid article; one-article categories stay valid', () => {
  const urls = ['/blog/first/', '/blog/third/'];
  assert.equal(pickRandomUrl(urls, () => 0), urls[0]);
  assert.equal(pickRandomUrl(urls, () => 0.99), urls[1]);
  assert.equal(pickRandomUrl(['/blog/second/'], () => 0.99), '/blog/second/');
  assert.equal(pickRandomUrl([], () => 0.5), undefined);
});
