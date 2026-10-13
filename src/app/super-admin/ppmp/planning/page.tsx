/**
 * Super Admin mirror of the personnel PPMP Planning page.
 * Same pattern as the analytics mirror: re-export the shared client
 * component because middleware restricts /personnel/* to pgso_personnel
 * and /super-admin/* to super_admin — a separate door for the same room.
 */
export { default } from "@/app/personnel/ppmp/planning/page";
