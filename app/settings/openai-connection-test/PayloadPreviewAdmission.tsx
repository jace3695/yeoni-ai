'use client';

import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {createPayloadPreviewEligibility} from '../../../lib/payload-preview-eligibility-client';
import PayloadPreviewPanel from './PayloadPreviewPanel';

export default function PayloadPreviewAdmission(){
 const [allowed,setAllowed]=useState(false);
 useEffect(()=>{
  const admission=createPayloadPreviewEligibility(fetch,setAllowed);
  const subscription=supabase?.auth.onAuthStateChange((event,session)=>{
   admission.change(event,session?{owner:session.user.id,token:session.access_token}:null);
  });
  return ()=>{admission.close();subscription?.data.subscription.unsubscribe();};
 },[]);
 return allowed?<PayloadPreviewPanel/>:null;
}
