/** Select only for the explicitly approved one-off deployment. No secret/env mutation. */
import {startZephyrEdge,type EdgeRuntime} from './edge-index.ts';
declare const Deno: EdgeRuntime;
startZephyrEdge(Deno, true);
