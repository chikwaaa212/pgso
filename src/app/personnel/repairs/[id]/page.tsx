import { redirect } from "next/navigation";

export const runtime = "nodejs";

export const metadata = {
  title: "Repair Receipt",
};

// Receipts are modal-only on the repairs list now — there is no dedicated
// page. Old/bookmarked ticket URLs land back on the list instead of 404ing.
export default async function RepairDetailPage() {
  redirect("/personnel/repairs");
}
