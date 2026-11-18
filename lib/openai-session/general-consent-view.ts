/** Public view only, not authorization. No owner/session/budget identifiers. */
export type GeneralConsentView=Readonly<{requestId:string;fingerprint:string;feature:'advice'|'conversation';question:string;summary:string;model:string;maxCostMicros:number;expiresAt:number;notice:string;healthNotice:string}>;
export function generalConfirmation(view:GeneralConsentView,accepted:boolean,healthAccepted:boolean,now:number){
 if(!accepted||!healthAccepted||!Number.isSafeInteger(now)||!Number.isSafeInteger(view.expiresAt)||view.expiresAt<=now||!Number.isSafeInteger(view.maxCostMicros)||view.maxCostMicros<=0)throw Error('CONSENT_REQUIRED');
 return Object.freeze({accepted:true,healthAccepted:true,requestId:view.requestId,fingerprint:view.fingerprint});
}
