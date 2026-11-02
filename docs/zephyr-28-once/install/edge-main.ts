/** UNREGISTERED deployment entry. Copy with edge-index.ts only after installation approval. */
import {startZephyrEdge,type EdgeRuntime} from './edge-index.ts';
declare const Deno: EdgeRuntime;
startZephyrEdge(Deno);
