export type AppRoute = 'game' | 'labs'

export function normalizePathname(pathname: string): string {
  let path = pathname
  if (path.endsWith('/index.html')) {
    path = path.slice(0, -'/index.html'.length) || '/'
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  return path
}

/** Deployment prefix before app routes, e.g. '' or '/centurion'. */
export function getBasePath(pathname: string): string {
  const path = normalizePathname(pathname)
  if (path === '/' || path === '/labs') {
    return ''
  }
  if (path.endsWith('/labs')) {
    return path.slice(0, -'/labs'.length) || ''
  }
  return path
}

export function pathnameToAppRoute(pathname: string): AppRoute {
  const path = normalizePathname(pathname)
  const base = getBasePath(pathname)
  const suffix = path.slice(base.length) || '/'
  return suffix === '/labs' ? 'labs' : 'game'
}

export function urlPathForRoute(
  route: AppRoute,
  pathname: string = typeof window !== 'undefined'
    ? window.location.pathname
    : '/',
): string {
  const base = getBasePath(pathname)
  const suffix = route === 'labs' ? '/labs' : '/'
  if (base === '') {
    return suffix
  }
  return `${base}${suffix}`
}

export function inviteUrl(
  code: string,
  origin: string = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://example.com',
  pathname?: string,
): string {
  const path = urlPathForRoute('game', pathname)
  const url = new URL(path, origin)
  url.searchParams.set('join', code)
  return url.href
}
