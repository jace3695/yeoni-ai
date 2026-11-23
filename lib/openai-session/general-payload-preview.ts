import {buildOpenAiAdviceWire} from '../openai-advice-server.ts';
import {readPayloadPreview} from '../openai-payload-preview-contract.ts';
import {GENERAL_MODEL_REFERENCE} from './general-model-policy.ts';
import {prepareReviewedAdviceWire} from './general-reviewed-runtime.ts';
import {assertGeneralSyntheticWire,GENERAL_SYNTHETIC_QUESTION} from './general-synthetic-execution.ts';

/** Fixed synthetic metadata computed by the app's real serializers; cannot be dispatched. */
export function previewFixedGeneralPayload(){
 const input={model:GENERAL_MODEL_REFERENCE.model,pricingVersion:GENERAL_MODEL_REFERENCE.pricingVersion,maxOutputTokens:512,
  question:GENERAL_SYNTHETIC_QUESTION,summary:'{}'};
 const wire=prepareReviewedAdviceWire(input,buildOpenAiAdviceWire(input));
 assertGeneralSyntheticWire(wire);
 const x=JSON.parse(wire),data=JSON.parse(x.messages[1].content);
 return readPayloadPreview({kind:'computed-no-send-preview',prepared:false,sent:false,providerResponse:false,
  model:x.model,question:data.question,recordSummary:data.recordSummary,storage:x.store,stream:x.stream,maximumOutputTokens:x.max_completion_tokens,
  serviceTier:x.service_tier,reasoningEffort:x.reasoning_effort});
}
