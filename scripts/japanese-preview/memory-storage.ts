/** Disposable synthetic bytes. No browser Storage instance is accepted. */
export class PreviewMemoryStorage implements Storage {
  private values = new Map<string, string>();
  private remainingFailures = 0;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(String(key)) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(String(key)); }
  setItem(key: string, value: string) {
    if (this.remainingFailures > 0) {
      this.remainingFailures--;
      throw new DOMException('가상 저장 실패: 다시 시도 흐름을 확인하세요.', 'QuotaExceededError');
    }
    this.values.set(String(key), String(value));
  }
  failNextWrite() { this.remainingFailures = 1; }
  resetFailure() { this.remainingFailures = 0; }
}
