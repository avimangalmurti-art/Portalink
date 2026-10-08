import {createServer} from 'node:http';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {mcpServer} from '../tests/helpers/mcp-server.mjs';
import {mcpFixture} from '../tests/helpers/mcp-database.mjs';
const sdk=process.env.MCP_SDK_PATH;
if(!sdk)throw Error('Set MCP_SDK_PATH to an isolated official SDK installation.');
const {Client}=await import(pathToFileURL(sdk+'/client/index.js'));
const {StreamableHTTPClientTransport}=await import(pathToFileURL(sdk+'/client/streamableHttp.js'));
const {db,page}=await mcpFixture();
const {handleMcp}=mcpServer();
const transcript=['Official @modelcontextprotocol/sdk client → actual Portalink handler over local HTTP.', 'Synthetic PGlite data only; NOT a production notification or Studio acceptance run.'];
const backend=async(url,options)=>{
 const name=String(url).split('/').at(-1),args=JSON.parse(options.body);
 let value;
 if(String(url).includes('/storage/'))return Response.json({signedURL:'/object/sign/project-media/safe/page1.webp?token=synthetic'});
 if(name==='mcp_allow_request')value=(await db.query('select mcp_allow_request($1) value',[args.p_ip_hash])).rows[0].value;
 else if(name==='search_citable_items')value=(await db.query('select search_citable_items($1,$2,$3,$4) value',[args.p_query,args.p_field,args.p_creator,args.p_limit])).rows[0].value;
 else if(name==='mcp_citation_item')value=(await db.query('select mcp_citation_item($1) value',[args.p_item_id])).rows[0].value;
 else if(name==='record_external_citation'){
  await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
  value=(await db.query('select record_external_citation($1,$2,$3) value',[args.p_item_id,args.p_ip_hash,args.p_context])).rows[0].value;
 }else throw Error('Unexpected RPC '+name);
 return Response.json(value);
};
const server=createServer(async(req,res)=>{
 try{
  const body=[];for await(const chunk of req)body.push(chunk);
  const headers=new Headers(req.headers);headers.set('cf-connecting-ip','192.0.2.1');
  const response=await handleMcp(new Request('http://localhost/mcp',{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(body)}:{})}),{supabaseUrl:'https://synthetic.supabase.co',publishableKey:'synthetic-anon',serverKey:'synthetic-server',ipSalt:'synthetic-test-salt'},backend);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
 }catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const client=new Client({name:'Portalink acceptance client',version:'1.0.0'});
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`)));
 transcript.push('initialize → Portalink 1.0.0; stateless Streamable HTTP negotiated.');
 const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),['search','fetch','cite','license']);transcript.push('tools/list → search, fetch, cite, license.');
 const search=JSON.parse((await client.callTool({name:'search',arguments:{query:'damping'}})).content[0].text);
 assert.equal(search.results.length,2);assert.ok(search.results.some(r=>r.id===page));transcript.push('search("damping") → two citable document pages; public view-only/private projects absent.');
 const fetched=JSON.parse((await client.callTool({name:'fetch',arguments:{citation_id:page}})).content[0].text).metadata;
 assert.equal(fetched.rendered,true);assert.equal(fetched.json_ld['@type'],'CreativeWork');assert.ok(fetched.plain_text.includes('Creator 1'));transcript.push('fetch(page UUID) → full-page URL, attribution, BibTeX and CreativeWork JSON-LD.');
 for(let n=0;n<2;n++)await client.callTool({name:'cite',arguments:{citation_id:page,context:'Structural dynamics lecture notes'}});
 assert.equal((await db.query('select count(*)::int n from citations')).rows[0].n,1);
 const notifications=(await db.query('select body from notifications')).rows;assert.equal(notifications.length,1);
 transcript.push('cite(page UUID, context), repeated → one external citation and one notification.');transcript.push('Notification: '+notifications[0].body);
 const resources=await client.listResources();assert.equal(resources.resources.length,2);
 await client.readResource({uri:'portalink://license/citable-v1'});transcript.push('resources/read → citable license terms.');
 transcript.push('PASS. Production/client-UI acceptance remains pending SQL approval, worker secrets and approved deployment.');
 writeFileSync('docs/mcp-client-transcript.md',transcript.join('\n\n')+'\n');console.log(transcript.join('\n'));
}finally{await client.close();await new Promise(resolve=>server.close(resolve));await db.close();}
