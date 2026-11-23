/**
 * Super Admin mirror of the personnel PPMP landing page — planning itself.
 * Middleware restricts /personnel/* to pgso_personnel and /super-admin/* to
 * super_admin, so this re-export is the admin door to the same screen.
 */
export { default } from "./planning/page";
