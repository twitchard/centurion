import { describe, expect, it } from 'vitest'
import config from './vite.config'

describe('vite config', () => {
  it('uses relative base paths for static hosting', () => {
    expect(config.base).toBe('./')
  })
})
