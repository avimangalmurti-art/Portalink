import { requireSupabase } from './client';
import { latestLegalDocuments, parseSignupConsent, type LegalDocument, type LegalService, type TermsAcceptance } from '../../features/legal/model';
async function account(accountId: string) {
  const {data,error}=await requireSupabase().auth.getSession();
  if(error || data.session?.user.id!==accountId) throw new Error('Your account changed. Sign in again.');
  return data.session;
}
export const supabaseLegalService: LegalService = {
  async documents() {
    const {data,error}=await requireSupabase().from('legal_documents').select('key,version,title,markdown_body,effective_at');
    if(error) throw new Error('The agreements are temporarily unavailable. Please try again.');
    return latestLegalDocuments(data as LegalDocument[]);
  },
  async acceptances(accountId) {
    await account(accountId);
    const {data,error}=await requireSupabase().from('terms_acceptances').select('document_key,version,accepted_at').eq('account_id',accountId);
    if(error) throw new Error('Your agreement history could not be read. Please try again.');
    await account(accountId);
    return (data as {document_key: TermsAcceptance['key'];version:string;accepted_at:string}[]).map(row=>({key:row.document_key,version:row.version,accepted_at:row.accepted_at}));
  },
  async accept(accountId,versions) {
    await account(accountId);
    if(!parseSignupConsent(versions)) throw new Error('Review all four agreements before continuing.');
    const {error}=await requireSupabase().from('terms_acceptances').upsert(versions.map(row=>({account_id:accountId,document_key:row.key,version:row.version})),{onConflict:'account_id,document_key,version',ignoreDuplicates:true});
    if(error) throw new Error('Your agreement could not be saved. An agreement may have changed; refresh and review before continuing.');
    await account(accountId);
  },
  async signupConsent(accountId) {
    await account(accountId);
    const {data,error}=await requireSupabase().auth.getUser();
    if(error || data.user?.id!==accountId) throw new Error('Your account could not be verified.');
    return parseSignupConsent(data.user.user_metadata?.portalink_legal_versions);
  },
  async sendEmail() {
    const {data,error}=await requireSupabase().auth.getSession();
    if(error) throw new Error('Your account could not be checked. Please try again.');
    const response=await fetch('/api/legal/send',{method:'POST',headers:data.session?{authorization:`Bearer ${data.session.access_token}`}:{},credentials:'omit',cache:'no-store'});
    const body=await response.json().catch(()=>null) as {message?:string}|null;
    if(!response.ok) throw new Error(body?.message ?? 'Email could not be sent. Please try again.');
    return body?.message ?? 'Links to the four agreements were sent to your account email.';
  },
};
