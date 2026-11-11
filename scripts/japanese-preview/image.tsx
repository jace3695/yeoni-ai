import { useEffect, useRef } from 'react';
import languageIcon from '../../public/app-icons/language.png';

// The preview build decodes this exact public PNG into inline RGBA bytes.
// Canvas keeps its original pixels without URLs, image decoders, or CSP grants.
const icon = languageIcon as unknown as { width: number; height: number; pixels: string };
export default function PreviewImage({ src, className }: { src?: unknown; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const supported = src === '/app-icons/language.png';
  useEffect(() => {
    if (!supported || !canvas.current) return;
    const pixels = Uint8ClampedArray.from(atob(icon.pixels), char => char.charCodeAt(0));
    if (pixels.length !== icon.width * icon.height * 4) throw new Error('Invalid bundled language icon');
    canvas.current.getContext('2d')?.putImageData(new ImageData(pixels, icon.width, icon.height), 0, 0);
  }, [supported]);
  return supported ? <canvas ref={canvas} width={icon.width} height={icon.height} className={className} aria-hidden="true" />
    : <span className="qa-image-omitted" aria-hidden="true">✦</span>;
}
