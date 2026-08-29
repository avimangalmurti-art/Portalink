interface StaticAssets {
  fetch(request: Request): Promise<Response>
}

interface SitesEnvironment {
  ASSETS: StaticAssets
}

const worker = {
  async fetch(request: Request, environment: SitesEnvironment): Promise<Response> {
    const response = await environment.ASSETS.fetch(request)

    if (response.status !== 404 || request.method !== 'GET') {
      return response
    }

    const accept = request.headers.get('accept') ?? ''
    if (!accept.includes('text/html')) {
      return response
    }

    const fallbackUrl = new URL('/index.html', request.url)
    return environment.ASSETS.fetch(new Request(fallbackUrl, request))
  },
}

export default worker
