import {TRIAL_QUESTION} from './synthetic-trial-client.ts';

export const PAYLOAD_PREVIEW_ELIGIBILITY_PATH='/api/ai/openai-general-synthetic/payload-preview/eligibility';
export const PAYLOAD_PREVIEW_PATH='/api/ai/openai-general-synthetic/payload-preview';
export type PayloadPreview={
 kind:'computed-no-send-preview';prepared:false;sent:false;providerResponse:false;
 model:string;question:string;recordSummary:'{}';storage:false;stream:false;
 maximumOutputTokens:number;serviceTier:'default';reasoningEffort:'none';
};
export function readPayloadPreview(value:unknown):PayloadPreview{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('PREVIEW_INVALID');
 const p=value as PayloadPreview;
 if(Object.keys(p).sort().join('|')!=='kind|maximumOutputTokens|model|prepared|providerResponse|question|reasoningEffort|recordSummary|sent|serviceTier|storage|stream'||
 p.kind!=='computed-no-send-preview'||p.prepared!==false||p.sent!==false||p.providerResponse!==false||
 typeof p.model!=='string'||!/^[a-z0-9.-]{1,80}$/.test(p.model)||p.question!==TRIAL_QUESTION||
 p.recordSummary!=='{}'||p.storage!==false||p.stream!==false||!Number.isSafeInteger(p.maximumOutputTokens)||p.maximumOutputTokens<1||p.maximumOutputTokens>512||
 p.serviceTier!=='default'||p.reasoningEffort!=='none')throw Error('PREVIEW_INVALID');
 return Object.freeze({...p});
}
type Session={owner:string;token:string};
export async function requestPayloadPreview(auth:()=>Promise<Session|null>,send:typeof fetch,signal:AbortSignal){
 const session=await auth();
 if(signal.aborted||!session?.token||!session.owner)throw Error('PREVIEW_UNAVAILABLE');
 const response=await send(PAYLOAD_PREVIEW_PATH,{method:'POST',headers:{Authorization:`Bearer ${session.token}`},
  credentials:'same-origin',cache:'no-store',redirect:'error',signal});
 if(signal.aborted||response.status!==200||!response.headers.get('content-type')?.startsWith('application/json'))throw Error('PREVIEW_UNAVAILABLE');
 const preview=readPayloadPreview(await response.json());
 const current=await auth();
 if(signal.aborted||current?.owner!==session.owner||current.token!==session.token)throw Error('PREVIEW_UNAVAILABLE');
 return preview;
}
