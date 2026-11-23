import {isComputedPayloadPreviewEnabled} from '../../../lib/openai-session/general-payload-preview-route';
import PayloadPreviewAdmission from './PayloadPreviewAdmission';
import TrialClient from './TrialClient';

export const dynamic='force-dynamic';
export default function Page(){
 return <TrialClient>{isComputedPayloadPreviewEnabled(process.env)?<PayloadPreviewAdmission/>:null}</TrialClient>;
}
