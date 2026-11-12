const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let dispose: (() => void) | undefined;

function initArticleReader() {
  dispose?.();
  const article = document.querySelector<HTMLElement>('[data-reader-article]');
  if (!article) return;
  const prose = article.querySelector<HTMLElement>('.prose');
  if (!prose) return;

  const controller = new AbortController();
  const { signal } = controller;
  const headings = [...article.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]')];
  const tocLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
  const desktopToc = document.querySelector<HTMLElement>('.reader-desktop-toc .toc-scroll');
  const desktopTocColumn = document.querySelector<HTMLElement>('.reader-desktop-toc');
  const desktopProgress = desktopTocColumn?.querySelector<HTMLButtonElement>('.reading-progress');
  const mobileToc = document.querySelector<HTMLDetailsElement>('.reader-mobile-toc');
  const progressButtons = [...document.querySelectorAll<HTMLButtonElement>('.reading-progress')];
  const layoutButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-reader-choice]')];
  let frame = 0;
  let activeIndex = -1;
  let lastPercent = -1;
  const positionDesktopProgress = () => {
    if (!desktopTocColumn || !desktopProgress) return;
    const column = desktopTocColumn.getBoundingClientRect();
    desktopProgress.style.left = `${column.left + column.width / 2}px`;
  };
  const layoutObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(positionDesktopProgress);
  if (desktopTocColumn) layoutObserver?.observe(desktopTocColumn);
  const readerLayout = document.querySelector<HTMLElement>('.reader-layout');
  if (readerLayout) layoutObserver?.observe(readerLayout);

  const headerOffset = () => (document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 70) + 18;
  const behavior = (): ScrollBehavior => reducedMotion.matches ? 'instant' : 'smooth';

  function showActive(index: number) {
    if (index === activeIndex) return;
    activeIndex = index;
    const activeId = headings[index]?.id;
    tocLinks.forEach((link) => {
      const linkedId = link.getAttribute('href')?.slice(1);
      const linkedIndex = headings.findIndex((heading) => heading.id === linkedId);
      const distance = Math.abs(linkedIndex - index);
      const opacity = linkedIndex === index ? 1 : Math.max(.42, 1 - distance * .18);
      link.style.setProperty('--toc-opacity', String(opacity));
      link.classList.toggle('is-active', linkedId === activeId);
      if (linkedId === activeId) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    if (desktopToc && activeId) {
      const current = tocLinks.find((link) => link.closest('.toc-scroll') && link.getAttribute('href') === `#${activeId}`);
      if (current) desktopToc.scrollTo({ top: current.offsetTop - desktopToc.clientHeight / 2 + current.clientHeight / 2, behavior: behavior() });
    }
  }

  function update() {
    frame = 0;
    const offset = headerOffset() + 22;
    let index = headings.length ? 0 : -1;
    for (let i = 0; i < headings.length; i++) {
      if (headings[i].getBoundingClientRect().top <= offset) index = i;
      else break;
    }
    if (index >= 0) showActive(index);

    const proseTop = prose.getBoundingClientRect().top + window.scrollY;
    const proseBottom = proseTop + prose.offsetHeight;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const visibleEnd = Math.max(1, Math.min(maxScroll, proseBottom - window.innerHeight + 80));
    const naturalStart = Math.max(0, proseTop - headerOffset() - 48);
    const startScroll = Math.min(naturalStart, Math.max(0, visibleEnd - Math.min(180, maxScroll / 2)));
    const endScroll = Math.max(startScroll + 1, visibleEnd);
    const progress = Math.max(0, Math.min(1, (window.scrollY - startScroll) / (endScroll - startScroll)));
    const percent = Math.round(progress * 100);
    const visible = window.scrollY > 120;
    progressButtons.forEach((button) => {
      button.querySelector<SVGCircleElement>('.progress-arc')?.style.setProperty('stroke-dashoffset', String(125.66 * (1 - progress)));
      button.classList.toggle('is-visible', visible);
    });
    if (percent !== lastPercent) {
      lastPercent = percent;
      progressButtons.forEach((button) => {
        button.setAttribute('aria-label', `返回顶部，已阅读 ${percent}%`);
      });
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  tocLinks.forEach((link) => link.addEventListener('click', (event) => {
    const id = link.getAttribute('href')?.slice(1);
    const target = id && document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    const url = new URL(location.href);
    url.hash = id;
    history.replaceState(null, '', url);
    if (mobileToc) mobileToc.open = false;
    requestAnimationFrame(() => {
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - headerOffset(), behavior: behavior() });
      schedule();
    });
  }, { signal }));

  progressButtons.forEach((button) => button.addEventListener('click', () => {
    history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo({ top: Math.max(0, article.getBoundingClientRect().top + window.scrollY - headerOffset()), behavior: behavior() });
  }, { signal }));

  const initialLayout = document.documentElement.dataset.readerLayout === 'b' ? 'b' : 'a';
  layoutButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.readerChoice === initialLayout));
    button.addEventListener('click', () => {
      const choice = button.dataset.readerChoice === 'b' ? 'b' : 'a';
      document.documentElement.dataset.readerLayout = choice;
      layoutButtons.forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.readerChoice === choice)));
      try { sessionStorage.setItem('reader-layout', choice); } catch { /* Storage may be unavailable. */ }
      const url = new URL(location.href);
      url.searchParams.set('layout', choice);
      history.replaceState(null, '', url);
      positionDesktopProgress();
      schedule();
    }, { signal });
  });

  window.addEventListener('scroll', schedule, { passive: true, signal });
  window.addEventListener('resize', () => { positionDesktopProgress(); schedule(); }, { passive: true, signal });
  positionDesktopProgress();
  update();
  dispose = () => { controller.abort(); layoutObserver?.disconnect(); if (frame) cancelAnimationFrame(frame); frame = 0; };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initArticleReader, { once: true });
else initArticleReader();
window.addEventListener('pagehide', () => dispose?.());
window.addEventListener('pageshow', (event) => { if (event.persisted) initArticleReader(); });
