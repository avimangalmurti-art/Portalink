interface StaticAssets {
  fetch(request: Request): Promise<Response>
}

interface SitesEnvironment {
  ASSETS: StaticAssets
}

const worker = {
  async fetch(request: Request, environment: SitesEnvironment): Promise<Response> {
    const accept = request.headers.get('accept') ?? ''
    if (request.method === 'GET' && accept.includes('text/html')) {
      // Client-side routes such as /share/:profileId must receive the app shell
      // directly. The Sites asset service redirects unknown paths to `/`, which
      // would otherwise erase the public-viewer route before React can read it.
      const appShellUrl = new URL('/index.html', request.url)
      return environment.ASSETS.fetch(new Request(appShellUrl, request))
    }

    return environment.ASSETS.fetch(request)
  },
}

export default worker
