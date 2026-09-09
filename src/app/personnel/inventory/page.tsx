import { Card } from "@/components/ui/card";
import prisma from "@/lib/prisma";
import styles from "../dashboard/page.module.css";

export default async function PersonnelInventoryPage() {
  const items = await prisma.inventoryItem.findMany({
    orderBy: { item_name: "asc" },
  });

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Inventory</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Inventory</h1>
          <p className={styles.subtitle}>
            {items.length} {items.length === 1 ? "item" : "items"} tracked
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionPrimary}>Add stock (soon)</span>
        </div>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Stock list</h2>
        {items.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>No inventory items recorded yet.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Location</th>
                  <th>Stock level</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const low =
                    item.reorder_threshold != null &&
                    item.quantity <= item.reorder_threshold;
                  const critical =
                    item.reorder_threshold != null &&
                    item.quantity <= Math.floor(item.reorder_threshold / 2);
                  return (
                    <tr key={item.id}>
                      <td>{item.item_name}</td>
                      <td>{item.category ?? "—"}</td>
                      <td>{item.quantity}</td>
                      <td>{item.unit ?? "—"}</td>
                      <td>{item.location ?? "—"}</td>
                      <td>
                        {critical ? (
                          <span className={styles.status} data-tone="bad">
                            Critical
                          </span>
                        ) : low ? (
                          <span className={styles.status} data-tone="warn">
                            Low stock
                          </span>
                        ) : (
                          <span className={styles.status} data-tone="ok">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
