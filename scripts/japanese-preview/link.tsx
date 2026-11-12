import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { previewHash } from './navigation';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string; children: ReactNode; onNavigate?: (event: { preventDefault(): void }) => void;
};
export default function PreviewLink({ href, children, onClick, onNavigate, ...props }: Props) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    onNavigate?.({ preventDefault: () => event.preventDefault() });
  };
  return <a {...props} href={previewHash(href)} onClick={click} target={undefined} download={undefined}>{children}</a>;
}
