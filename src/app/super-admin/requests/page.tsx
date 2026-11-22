/**
 * Super Admin sees the same Requests experience as personnel — identical
 * summary tiles, tabs, search, detail view, new-request dialog, issuance
 * evaluation, and optimistic updates. The shared page reads the whole queue
 * for an admin (instead of only requests sent to the signed-in user), so an
 * admin can also file requests and assign items directly to employees.
 */
export { default } from "@/app/personnel/requests/page";
