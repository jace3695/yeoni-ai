/** A display lifetime only. Does not authorize or schedule any request. */
const VISIBLE_MS=5*60_000;
type Clock={wall:number;monotonic:number};
export type PreviewDisplayDeadline=Readonly<Clock>;
export const previewDisplayClock=():Clock=>({wall:Date.now(),monotonic:performance.now()});
export function startPreviewDisplay(now=previewDisplayClock()):PreviewDisplayDeadline{
 return Object.freeze({wall:now.wall+VISIBLE_MS,monotonic:now.monotonic+VISIBLE_MS});
}
export function remainingPreviewDisplay(deadline:PreviewDisplayDeadline,now=previewDisplayClock()){
 return Math.max(0,Math.min(VISIBLE_MS,deadline.wall-now.wall,deadline.monotonic-now.monotonic));
}
