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
      // Fetch the canonical root instead of `/index.html`: the Sites asset
      // service redirects `/index.html` to `/`, and forwarding that redirect
      // would make the browser lose the original shared-viewer URL.
      const appShellUrl = new URL('/', request.url)
      return environment.ASSETS.fetch(new Request(appShellUrl, request))
    }

    return environment.ASSETS.fetch(request)
  },
}

export default worker
