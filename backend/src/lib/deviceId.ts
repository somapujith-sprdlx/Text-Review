import type { Context } from 'hono'

const DEVICE_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/

// Shared by usageLimit.ts and the device-state route so both validate the
// extension's X-Device-Id header the same way.
export function getDeviceId(c: Context): string | null {
  const deviceId = c.req.header('x-device-id')
  return deviceId && DEVICE_ID_PATTERN.test(deviceId) ? deviceId : null
}
