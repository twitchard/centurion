import { describe, expect, it } from 'vitest'
import {
  getBasePath,
  inviteUrl,
  pathnameToAppRoute,
  urlPathForRoute,
} from './routing'

describe('routing', () => {
  it('maps root and labs paths at the site root', () => {
    expect(pathnameToAppRoute('/')).toBe('game')
    expect(pathnameToAppRoute('/labs')).toBe('labs')
    expect(getBasePath('/')).toBe('')
    expect(getBasePath('/labs')).toBe('')
    expect(urlPathForRoute('game', '/')).toBe('/')
    expect(urlPathForRoute('labs', '/labs')).toBe('/labs')
  })

  it('maps paths under a GitHub Pages project subpath', () => {
    expect(pathnameToAppRoute('/centurion/')).toBe('game')
    expect(pathnameToAppRoute('/centurion')).toBe('game')
    expect(pathnameToAppRoute('/centurion/labs')).toBe('labs')
    expect(getBasePath('/centurion/')).toBe('/centurion')
    expect(getBasePath('/centurion/labs')).toBe('/centurion')
    expect(urlPathForRoute('game', '/centurion/')).toBe('/centurion/')
    expect(urlPathForRoute('labs', '/centurion/labs')).toBe('/centurion/labs')
  })

  it('builds invite links that keep the deployment subpath', () => {
    expect(inviteUrl('123456', 'https://user.github.io', '/centurion/')).toBe(
      'https://user.github.io/centurion/?join=123456',
    )
    expect(inviteUrl('123456', 'https://user.github.io', '/')).toBe(
      'https://user.github.io/?join=123456',
    )
  })
})
