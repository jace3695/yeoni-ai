/** Match the session summary rounding, without deriving duration from editable text. */
export function sessionElapsedMinutes(elapsedSeconds: number): number {
  return Math.max(1, Math.ceil(elapsedSeconds / 60));
}
