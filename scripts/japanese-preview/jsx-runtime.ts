import { jsx as reactJsx, jsxs as reactJsxs, Fragment } from 'react/jsx-runtime';
import { previewHash } from './navigation';

export { Fragment };

// Product reference panels also contain plain <a> elements. Keep their actual
// DOM destinations hash-only, including modified clicks and context-menu opens.
function isolatedProps(type: unknown, props: Record<string, unknown> | null) {
  if (type !== 'a') return props;
  const href = typeof props?.href === 'string' ? props.href : '';
  return { ...props, href: previewHash(href.startsWith('#') ? href.slice(1) : href),
    target: undefined, download: undefined, ping: undefined };
}

export const jsx: typeof reactJsx = (type, props, key) => reactJsx(type, isolatedProps(type, props as Record<string, unknown> | null), key);
export const jsxs: typeof reactJsxs = (type, props, key) => reactJsxs(type, isolatedProps(type, props as Record<string, unknown> | null), key);
