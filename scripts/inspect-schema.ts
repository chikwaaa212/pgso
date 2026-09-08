import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const userId = 'b03768b8-cd7c-4d16-8380-c0052c8d43d8'

  // Check identities schema
  const cols = await prisma.$queryRaw<{ column_name: string; data_type: string; is_nullable: string }[]>`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities'
    ORDER BY ordinal_position
  `
  console.log('Identities columns:', cols)

  // Check instances schema
  const instCols = await prisma.$queryRaw<{ column_name: string; data_type: string; is_nullable: string }[]>`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'instances'
    ORDER BY ordinal_position
  `
  console.log('Instances columns:', instCols)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })