import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Local Vite serves the same public-media handler as the deployed worker. */
export function publicMediaPreviewPlugin({ supabaseUrl }) {
  return {
    name: 'portalink-public-media-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = (request.url ?? '/').split('?')[0];
        if (pathname !== '/media' && !pathname.startsWith('/media/')) return next();
        try {
          const { handlePublicMedia, isPublicMediaRoute } = await server.ssrLoadModule('/src/server/publicMedia.ts');
          // Unknown /media prefixes must not fall through to Vite's SPA shell.
          if (!isPublicMediaRoute(pathname)) {
            response.statusCode = 404;
            response.setHeader('cache-control', 'no-store');
            response.end();
            return;
          }
          const headers = new Headers();
          for (const name of ['accept', 'if-none-match']) {
            const value = request.headers[name];
            if (typeof value === 'string') headers.set(name, value);
          }
          const input = new Request(new URL(request.url, 'http://127.0.0.1'), {
            method: request.method ?? 'GET', headers,
          });
          const result = await handlePublicMedia(input, { supabaseUrl });
          response.statusCode = result.status;
          result.headers.forEach((value, name) => response.setHeader(name, value));
          if (!result.body) response.end();
          else await pipeline(Readable.fromWeb(result.body), response);
        } catch {
          if (response.headersSent) response.destroy();
          else {
            response.statusCode = 502;
            response.setHeader('cache-control', 'no-store');
            response.end();
          }
        }
      });
    },
  };
}
