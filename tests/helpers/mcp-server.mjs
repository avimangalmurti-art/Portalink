import {sourceModule} from './source-module.mjs';
export function mcpServer(){
 const model=sourceModule('src/features/citations/model.ts');
 const covers=sourceModule('src/services/supabase/coverThumbnailReads.ts',{'../../features/media/publicMediaUrl':{publicCoverUrl:path=>'/media/covers/'+path}});
 const license=sourceModule('src/server/citation.ts',{'../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://portalinknetworksinc.avimangalmurti566055.chatgpt.site'},'../features/citations/model':model},{Request,Response,fetch});
 return sourceModule('src/server/mcp.ts',{'../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://portalinknetworksinc.avimangalmurti566055.chatgpt.site'},'../features/citations/model':model,'../services/supabase/coverThumbnailReads':covers,'../features/media/publicMediaUrl':{publicCoverUrl:path=>'/media/covers/'+path},'./citation':license},{Request,Response,fetch,AbortSignal,TextEncoder,TextDecoder});
}
