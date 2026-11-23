import {createComputedPayloadPreviewHandler} from '../../../../../lib/openai-session/general-payload-preview-route.ts';
export const runtime='nodejs';
export const POST=createComputedPayloadPreviewHandler(process.env);
