import 'server-only'

import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  const base = new PrismaClient({ log: ['error', 'warn'] })
  // Temporary per-query timing (PERF_TRACE=1 only — no-op otherwise).
  // Measures each Prisma model query; raw queries are timed at call sites.
  try {
    if (process.env.PERF_TRACE === '1') {
      return base.$extends({
        query: {
          $allModels: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async $allOperations({ model, operation, args, query }: any) {
              const t0 = Date.now()
              try {
                return await query(args)
              } finally {
                try {
                  console.log(`[perf prisma] ${model}.${operation}: ${Date.now() - t0}ms`)
                } catch {
                  /* ignore */
                }
              }
            },
          },
        },
      }) as unknown as PrismaClient
    }
  } catch {
    /* fall through to base client */
  }
  return base
}

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined
}

const prisma = globalForPrisma.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
