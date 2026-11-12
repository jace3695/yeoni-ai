/** Exercise React's real submit handler without granting native form submission
 * to this opaque sandbox. This adapter is QA-only, not a production form test. */
export function dispatchSandboxSubmit(form: Pick<HTMLFormElement, 'reportValidity' | 'dispatchEvent'>) {
  if (!form.reportValidity()) return false;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return true;
}

