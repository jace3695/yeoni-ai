/** Images are excluded from this isolated preview. Preserve the real mascot's
 * surrounding layout without mounting an image or accepting any resource URL. */
export default function PreviewImage() {
  return <span className="qa-image-omitted" aria-hidden="true">✦</span>;
}
