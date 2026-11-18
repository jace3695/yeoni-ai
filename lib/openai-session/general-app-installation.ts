import {createGeneralRouteHandler} from './general-route-handler.ts';
import {createGeneralPrepareHandler} from './general-prepare-handler.ts';
import type {createGeneralAppFlow} from './general-app-flow.ts';
/** Explicit assembly seam, NOT configured via env or mere feature flag. */
export function createGeneralAppHandlers(config:{enabled:boolean;allowedOrigin?:string}={enabled:false},flow?:ReturnType<typeof createGeneralAppFlow>){
 return Object.freeze({POST:createGeneralRouteHandler(config,flow?.execute),PREPARE:createGeneralPrepareHandler(config,flow?.prepare)});
}
// Default route wiring performs zero auth, DB, credential or provider access.
export const GENERAL_APP_HANDLERS=createGeneralAppHandlers();
