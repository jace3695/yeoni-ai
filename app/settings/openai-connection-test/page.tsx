import {isComputedPayloadPreviewEnabled,reportPayloadPreviewPageStage} from '../../../lib/openai-session/general-payload-preview-route';
import PayloadPreviewAdmission from './PayloadPreviewAdmission';
import TrialClient from './TrialClient';

export const dynamic='force-dynamic';
export default function Page(){
 const enabled=isComputedPayloadPreviewEnabled(process.env);
 reportPayloadPreviewPageStage(process.env,enabled);
 return <TrialClient>{enabled?<PayloadPreviewAdmission/>:null}</TrialClient>;
}
