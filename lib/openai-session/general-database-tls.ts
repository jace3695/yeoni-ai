import {X509Certificate} from 'node:crypto';

export type GeneralDatabaseTlsOptions=Readonly<{rejectUnauthorized:true;ca?:string}>;

/** Scope an explicitly configured, trusted Supabase root only to this database client.
 * The setting is optional for backward compatibility, but any supplied invalid root fails closed.
 * Pass the exact official PEM verbatim. Never accept a leaf certificate or change hostname checks.
 */
export function generalDatabaseTlsOptions(raw?:string):GeneralDatabaseTlsOptions {
 if(raw===undefined)return Object.freeze({rejectUnauthorized:true});
 const invalid=()=>Error('GENERAL_DATABASE_CA_INVALID');
 if(raw.length>8192||!/^[\r\n ]*-----BEGIN CERTIFICATE-----[\r\nA-Za-z0-9+/=]+-----END CERTIFICATE-----[\r\n ]*$/.test(raw))throw invalid();
 const ca=raw.trim()+'\n';
 try {
  const cert=new X509Certificate(ca);
  if(!cert.ca||!cert.checkIssued(cert)||!cert.verify(cert.publicKey))throw invalid();
  const now=Date.now();
  if(Date.parse(cert.validFrom)>now||Date.parse(cert.validTo)<=now)throw invalid();
  return Object.freeze({rejectUnauthorized:true,ca});
 }catch{throw invalid();}
}
