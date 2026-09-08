import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Check instances
  const instances = await prisma.$queryRaw`
    SELECT id, uuid, created_at FROM auth.instances
  `
  console.log('Instances:', instances)

  // Check user
  const [user] = await prisma.$queryRaw<{ id: string; email: string; instance_id: string | null }[]>`
    SELECT id, email, instance_id FROM auth.users WHERE email = 'pgso.personnel@gmail.com'
  `
  console.log('User:', user)
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