import kanaStrokeBundle from '../../public/kana-strokes.json';

/** Build-time public glyph bytes only. Never delegates to a browser or service. */
export async function qaAssetRequest(input: unknown, options?: unknown) {
  if (input !== '/kana-strokes.json' || options !== undefined) {
    throw new Error('가상 검사에서는 외부 요청을 허용하지 않아요. 포함된 가나 획순 자료만 읽을 수 있어요.');
  }
  return { ok: true, json: async () => ({ ...kanaStrokeBundle }) };
}
