import { Hono } from 'hono'

import { STYLES, type StyleId } from '../../../shared/styles.js'

export { STYLES, type StyleId }

export const stylesRoute = new Hono()

stylesRoute.get('/', (c) => {
  return c.json({ styles: STYLES })
})
