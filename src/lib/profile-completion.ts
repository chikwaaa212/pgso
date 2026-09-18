export const PROFILE_PREFIXES = [
  'Mr.',
  'Ms.',
  'Mrs.',
  'Dr.',
  'Atty.',
  'Hon.',
  'Engr.',
  'Rev.',
] as const

export const PROFILE_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const

export interface ProfileCompletionStatus {
  profile_completed?: boolean | null
  first_name?: string | null
  last_name?: string | null
  employee_no?: string | null
  department?: string | null
  position?: string | null
  office?: string | null
}

/** True when the employee must see the blocking first-login overlay. */
export function needsProfileCompletion(
  profile: ProfileCompletionStatus | null
): boolean {
  if (!profile) return false
  if (!profile.profile_completed) return true
  return !(
    profile.first_name?.trim() &&
    profile.last_name?.trim() &&
    profile.employee_no?.trim() &&
    profile.department?.trim() &&
    profile.position?.trim() &&
    profile.office?.trim()
  )
}

export function composeFullName(input: {
  prefix: string
  firstName: string
  middleName: string
  lastName: string
  suffix: string
}): string {
  const parts = [
    input.prefix,
    input.firstName,
    input.middleName,
    input.lastName,
  ].filter(Boolean)
  const base = parts.join(' ').replace(/\s+/g, ' ').trim()
  return input.suffix ? `${base}, ${input.suffix}` : base
}
