/**
 * Super Admin mirror of the personnel PPMP Analytics page.
 * The shared client component calls the same owner-scoped server actions,
 * which lift the owner filter for active super_admin callers
 * (getPersonnelScope().isSuperAdmin). Lives here because middleware
 * restricts /personnel/* to pgso_personnel and /super-admin/* to
 * super_admin — a separate door for the same room, per repo convention.
 */
export { default } from "@/app/personnel/ppmp/analytics/page";
