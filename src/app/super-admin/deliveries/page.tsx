/**
 * Super Admin sees the same Deliveries experience as personnel — identical
 * layout, search, row actions, dialogs and optimistic updates. The server
 * readers already return every record for a super admin, so this page simply
 * reuses the personnel implementation.
 */
export { default } from "@/app/personnel/deliveries/page";