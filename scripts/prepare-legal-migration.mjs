import {readFileSync,writeFileSync} from 'node:fs';
const keys=['terms','privacy','content-licence','ai-access'];
const titles=['Portalink Terms of Service','Privacy Policy','Content Licence — Private, Public, Citable','AI Access Terms'];
const base=readFileSync(new URL('./legal-schema-template.sql.txt',import.meta.url),'utf8');
const values=keys.map((key,i)=>{
  const body=readFileSync(new URL(`../docs/legal/${key}.md`,import.meta.url),'utf8');
  if(body.includes('$legal_body$'))throw new Error('Reserved SQL delimiter in legal source.');
  return `('${key}','1.0','${titles[i]}',$legal_body$${body}$legal_body$,'2026-10-12T00:00:00Z')`;
});
writeFileSync(new URL('../supabase/pending/legal_documents_and_acceptances.sql',import.meta.url),base+`\ninsert into public.legal_documents(key,version,title,markdown_body,effective_at) values\n${values.join(',\n')};\ncommit;\n`);
console.log('Prepared one pending legal migration; nothing applied.');
