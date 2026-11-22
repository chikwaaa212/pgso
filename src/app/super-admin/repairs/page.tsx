/**
 * Super Admin sees the same Repairs experience as personnel — identical
 * summary tiles, status tabs, search, new-repair dialog, edit/start/complete
 * flow, details view and receipt overlay. The shared readers already return
 * every ticket for a super admin, and `createRepair` accepts super admins, so
 * an admin can also log repairs directly.
 */
export { default } from "@/app/personnel/repairs/page";
