import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'

/**
 * Active master data for personnel dropdowns (Phase 3 strict mode).
 * Any signed-in user may read; writes stay Super Admin only.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [units, catalog] = await Promise.all([
      prisma.unit.findMany({
        where: { status: 'active' },
        orderBy: { name: 'asc' },
        select: { name: true, abbreviation: true },
      }),
      prisma.accountCatalog.findMany({
        where: { status: 'active' },
        orderBy: { account_code: 'asc' },
        select: { account_code: true, account_title: true, asset_type: true, account_name: true },
      }),
    ])

    return NextResponse.json({ units, catalog })
  } catch (e) {
    console.error('[api/master-data]', e)
    return NextResponse.json({ error: 'Failed to load master data' }, { status: 500 })
  }
}
