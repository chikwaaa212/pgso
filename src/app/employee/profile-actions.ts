'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { requireEmployee } from '@/lib/auth-guard'
import { resolveDepartmentName, getActiveDepartments } from '@/lib/master-data'
import { writeAuditLog } from '@/lib/audit'
import {
  PROFILE_PREFIXES,
  PROFILE_SUFFIXES,
  composeFullName,
} from '@/lib/profile-completion'

const NAME_RE = /^[A-Za-zÑñÁáÉéÍíÓóÚúÜü'’.\- ]+$/
const EMP_NO_RE = /^[A-Za-z0-9][A-Za-z0-9\-_/. ]{0,48}[A-Za-z0-9]$/

export interface CompleteProfileInput {
  prefix?: string
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string
  employeeNo: string
  department: string
  position: string
  office: string
}

export interface CompleteProfileResult {
  success?: boolean
  error?: string
  fieldErrors?: Partial<Record<keyof CompleteProfileInput, string>>
}

function clean(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/**
 * First-login profile completion. Called once from the blocking overlay —
 * after this the employee enters the portal normally. Employee ID must be
 * unique; department must match an active department when the master list
 * is non-empty.
 */
export async function completeMyProfile(
  input: CompleteProfileInput
): Promise<CompleteProfileResult> {
  let userId = ''
  try {
    ;({ userId } = await requireEmployee())
  } catch {
    return { error: 'You must be signed in as an employee.' }
  }

  const prefix = clean(input.prefix, 20)
  const firstName = clean(input.firstName, 100)
  const middleName = clean(input.middleName, 100)
  const lastName = clean(input.lastName, 100)
  const suffix = clean(input.suffix, 20)
  const employeeNo = clean(input.employeeNo, 50)
  const departmentRaw = clean(input.department, 255)
  const position = clean(input.position, 255)
  const office = clean(input.office, 255)

  const fieldErrors: CompleteProfileResult['fieldErrors'] = {}

  if (prefix && !(PROFILE_PREFIXES as readonly string[]).includes(prefix)) {
    fieldErrors.prefix = 'Select a valid prefix.'
  }
  if (!firstName) fieldErrors.firstName = 'First name is required.'
  else if (firstName.length < 2) fieldErrors.firstName = 'First name is too short.'
  else if (!NAME_RE.test(firstName)) fieldErrors.firstName = 'Letters, spaces, hyphen and apostrophe only.'

  if (middleName && !NAME_RE.test(middleName)) {
    fieldErrors.middleName = 'Letters, spaces, hyphen and apostrophe only.'
  }

  if (!lastName) fieldErrors.lastName = 'Last name is required.'
  else if (lastName.length < 2) fieldErrors.lastName = 'Last name is too short.'
  else if (!NAME_RE.test(lastName)) fieldErrors.lastName = 'Letters, spaces, hyphen and apostrophe only.'

  if (suffix && !(PROFILE_SUFFIXES as readonly string[]).includes(suffix)) {
    fieldErrors.suffix = 'Select a valid suffix.'
  }

  if (!employeeNo) fieldErrors.employeeNo = 'Employee ID is required.'
  else if (employeeNo.length < 2) fieldErrors.employeeNo = 'Employee ID is too short.'
  else if (!EMP_NO_RE.test(employeeNo)) {
    fieldErrors.employeeNo = 'Letters, numbers, dash, slash and spaces only.'
  }

  if (!departmentRaw) fieldErrors.department = 'Department is required.'
  if (!position) fieldErrors.position = 'Position is required.'
  else if (position.length < 2) fieldErrors.position = 'Position is too short.'
  if (!office) fieldErrors.office = 'Office is required.'
  else if (office.length < 2) fieldErrors.office = 'Office is too short.'

  // Department must exist in the admin-managed master list when it is non-empty.
  let department = departmentRaw
  if (departmentRaw) {
    try {
      const active = await getActiveDepartments()
      if (active.length > 0) {
        const canonical = await resolveDepartmentName(departmentRaw)
        if (!canonical) {
          fieldErrors.department = 'Select a valid department.'
        } else {
          department = canonical
        }
      }
    } catch {
      // master-data is best-effort; fall back to free text
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'Please fix the highlighted fields.', fieldErrors }
  }

  // Unique employee ID (excluding self so re-submits don't false-positive).
  try {
    const clash = await prisma.profile.findFirst({
      where: { employee_no: employeeNo, NOT: { id: userId } },
      select: { id: true },
    })
    if (clash) {
      return {
        error: 'This Employee ID is already registered.',
        fieldErrors: { employeeNo: 'This Employee ID is already registered.' },
      }
    }
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((e as any)?.code === 'P2022') {
      console.error('[completeMyProfile:migration-missing]', e)
      return {
        error:
          'Profile setup needs a database update (migration 25). Ask your admin to run it in Supabase, then try again.',
      }
    }
    console.error('[completeMyProfile:unique-check]', e)
    return { error: 'Could not verify Employee ID. Please try again.' }
  }

  const fullName = composeFullName({
    prefix,
    firstName,
    middleName,
    lastName,
    suffix,
  })

  try {
    await prisma.profile.update({
      where: { id: userId },
      data: {
        prefix: prefix || null,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        suffix: suffix || null,
        employee_no: employeeNo,
        department,
        position,
        office,
        full_name: fullName,
        profile_completed: true,
        profile_completed_at: new Date(),
      },
    })
  } catch (e) {
    // P2002 = unique violation on employee_no (race between check + write).
    // P2022 = column missing (migration 25 not applied yet).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (e as any)?.code as string | undefined
    if (code === 'P2002') {
      return {
        error: 'This Employee ID is already registered.',
        fieldErrors: { employeeNo: 'This Employee ID is already registered.' },
      }
    }
    if (code === 'P2022') {
      console.error('[completeMyProfile:migration-missing]', e)
      return {
        error:
          'Profile setup needs a database update (migration 25). Ask your admin to run it in Supabase, then try again.',
      }
    }
    console.error('[completeMyProfile:update]', e)
    return { error: 'Could not save your profile. Please try again.' }
  }

  try {
    await writeAuditLog({
      userId,
      action: 'profile:complete',
      module: 'profile',
      details: {
        purpose: 'First-login profile completion',
        summary: `Completed profile for ${fullName} (${employeeNo})`,
      },
    })
  } catch {
    // audit is best-effort
  }

  revalidatePath('/employee')
  return { success: true }
}
