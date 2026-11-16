import styles from "./report.module.css";

/**
 * Report-page skeleton — mirrors the detail layout (header + actions, three
 * summary tiles, form paper on the left, facts + related on the right) so the
 * real form swaps in without a layout jump.
 */
export default function IssuanceReportLoading() {
  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <span
              className={styles.sk}
              style={{ width: "7rem", height: "0.625rem", marginBottom: "0.75rem" }}
            />
            <div className={styles.headline}>
              <span
                className={styles.sk}
                style={{ width: "2.75rem", height: "2.75rem", borderRadius: "10px" }}
              />
              <div className={styles.headlineText}>
                <div className={styles.titleRow}>
                  <span
                    className={styles.sk}
                    style={{ width: "18rem", height: "1.375rem" }}
                  />
                  <span
                    className={styles.sk}
                    style={{ width: "2.5rem", height: "1.25rem" }}
                  />
                </div>
                <span
                  className={styles.sk}
                  style={{
                    width: "22rem",
                    height: "0.75rem",
                    marginTop: "0.4rem",
                  }}
                />
              </div>
            </div>
          </div>
          <div className={styles.actions}>
            {[7.5, 7, 5.5, 7].map((w, i) => (
              <span
                key={i}
                className={styles.sk}
                style={{ width: `${w}rem`, height: "1.5rem" }}
              />
            ))}
          </div>
        </header>

        <div className={styles.summary}>
          {[0, 1, 2].map((i) => (
            <div className={styles.tile} key={i}>
              <span className={styles.sk} style={{ width: "6rem", height: "0.625rem" }} />
              <span
                className={styles.sk}
                style={{ width: "8rem", height: "1rem", marginTop: "0.375rem" }}
              />
              <span
                className={styles.sk}
                style={{ width: "11rem", height: "0.625rem", marginTop: "0.25rem" }}
              />
            </div>
          ))}
        </div>

        <div className={styles.layout}>
          <div className={styles.docColumn}>
            <div className={styles.paper}>
              <div className={styles.paperSkeleton} aria-hidden="true">
                <span className={styles.sk} style={{ width: "40%", height: "0.75rem" }} />
                <span className={styles.sk} style={{ width: "62%", height: "1.125rem" }} />
                <span
                  className={styles.sk}
                  style={{ width: "100%", height: "1.75rem", marginTop: "0.5rem" }}
                />
                <span className={styles.sk} style={{ width: "100%", height: "18rem" }} />
                <span className={styles.sk} style={{ width: "70%", height: "0.75rem" }} />
              </div>
            </div>
          </div>

          <aside className={styles.side}>
            {[0, 1].map((i) => (
              <section className={styles.card} key={i}>
                <span className={styles.sk} style={{ width: "8rem", height: "0.75rem" }} />
                {[0, 1, 2, 3, 4].map((row) => (
                  <div className={styles.factRow} key={row}>
                    <span className={styles.sk} style={{ width: "4.5rem", height: "0.625rem" }} />
                    <span className={styles.sk} style={{ width: "9rem", height: "0.625rem" }} />
                  </div>
                ))}
              </section>
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
