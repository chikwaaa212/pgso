import { Card } from "@/components/ui/card";
import { label } from "@/lib/labels";
import { getCatalog, getUnits } from "./actions";
import { AddCatalogForm, AddUnitForm, CatalogEdit, CatalogToggle, UnitToggle } from "./master-forms";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function SuperAdminMasterDataPage() {
  const [units, catalog] = await Promise.all([getUnits(), getCatalog()]);
  const activeUnits = units.filter((u) => u.status === "active").length;
  const activeCatalog = catalog.filter((c) => c.status === "active").length;

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Master Data</p>
      <div>
        <h1 className={styles.title}>Master Data</h1>
        <p className={styles.subtitle}>
          {activeUnits} active units · {activeCatalog} active catalog entries. Personnel
          pick from these lists — deactivation is blocked while a value is in use.
        </p>
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Units</h2>
        <p className={styles.panelSub}>
          Lowercase canonical names (e.g. piece, set, box). Abbreviations optional.
        </p>
        <AddUnitForm />
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Abbr</th>
                <th>Used in</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.abbreviation ?? "—"}</td>
                  <td>{u.usage}</td>
                  <td>
                    <span className={styles.status} data-tone={u.status === "active" ? "ok" : "bad"}>
                      {label(u.status)}
                    </span>
                  </td>
                  <td>
                    <UnitToggle id={u.id} name={u.name} isActive={u.status === "active"} />
                  </td>
                </tr>
              ))}
              {units.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>No units yet — add the first one above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Account catalog (code + title + asset type)</h2>
        <p className={styles.panelSub}>
          One record links the triple together. Selecting a code auto-fills title and
          type in personnel forms (strict in Phase 3).
        </p>
        <AddCatalogForm />
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Asset type</th>
                <th>Used in</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((c) => (
                <tr key={c.id}>
                  <td>{c.account_code}</td>
                  <td>{c.account_title}</td>
                  <td>{c.asset_type}</td>
                  <td>{c.usage}</td>
                  <td>
                    <span className={styles.status} data-tone={c.status === "active" ? "ok" : "bad"}>
                      {label(c.status)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                      <CatalogEdit id={c.id} title={c.account_title} type={c.asset_type} description={c.description} />
                      <CatalogToggle id={c.id} code={c.account_code} isActive={c.status === "active"} />
                    </div>
                  </td>
                </tr>
              ))}
              {catalog.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>No catalog entries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
