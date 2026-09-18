import 'server-only'

import { Redis } from '@upstash/redis'

let client: Redis | null = null

function hasConfig() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN
  )
}

/**
 * Lazy Upstash client. Returns null when env is missing so all
 * cache helpers degrade to direct DB reads (no crash in dev/CI).
 */
export function getRedis(): Redis | null {
  if (!hasConfig()) return null
  if (!client) {
    client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return client
}

export function isRedisEnabled() {
  return hasConfig()
}
