import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { dispatchSandboxSubmit } from './form-submit';

export default function SandboxFormBridge({ children }: { children: ReactNode }) {
  const click = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (!button || button.type !== 'submit' || button.disabled || !button.form) return;
    event.preventDefault();
    dispatchSandboxSubmit(button.form);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)
      || !['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(event.target.type)
      || !event.target.form || event.target.disabled) return;
    event.preventDefault();
    dispatchSandboxSubmit(event.target.form);
  };
  return <div onClickCapture={click} onKeyDownCapture={key}>{children}</div>;
}
