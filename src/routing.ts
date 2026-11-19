export type AppRoute = 'game' | 'labs' | 'ink' | 'play'

const ROUTE_SUFFIXES = ['/labs', '/ink', '/play'] as const

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
  if (path === '/' || path === '/labs' || path === '/ink' || path === '/play') {
    return ''
  }
  for (const suffix of ROUTE_SUFFIXES) {
    if (path.endsWith(suffix)) {
      return path.slice(0, -suffix.length) || ''
    }
  }
  return path
}

export function pathnameToAppRoute(pathname: string): AppRoute {
  const path = normalizePathname(pathname)
  const base = getBasePath(pathname)
  const suffix = path.slice(base.length) || '/'
  if (suffix === '/labs') {
    return 'labs'
  }
  if (suffix === '/ink') {
    return 'ink'
  }
  if (suffix === '/play') {
    return 'play'
  }
  return 'game'
}

export function urlPathForRoute(
  route: AppRoute,
  pathname: string = typeof window !== 'undefined'
    ? window.location.pathname
    : '/',
): string {
  const base = getBasePath(pathname)
  const suffix =
    route === 'labs'
      ? '/labs'
      : route === 'ink'
        ? '/ink'
        : route === 'play'
          ? '/play'
          : '/'
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
