const supported = new Set(['/language', '/language/levels', '/language/chunk-review', '/language/learn', '/language/qa-catalog', '/language/qa-chunks', '/language/kana', '/language/words', '/language/grammar']);

/** A hash cannot load /language, even via middle click, new tab or context menu. */
export function previewHash(href: string): string {
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\r\n]/.test(href)) return '#/unsupported';
  const queryAt = href.indexOf('?');
  const pathname = queryAt < 0 ? href : href.slice(0, queryAt);
  if (!supported.has(pathname) || href.includes('#')) return '#/unsupported';
  if (pathname === '/language') return '#/language/levels';
  const query = queryAt < 0 ? '' : new URLSearchParams(href.slice(queryAt + 1)).toString();
  return `#${pathname}${query ? `?${query}` : ''}`;
}

export function readPreviewLocation(hash: string) {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  const normalized = previewHash(value || '/language/levels').slice(1);
  const [pathname, query = ''] = normalized.split('?');
  return { pathname, query: new URLSearchParams(query) };
}
