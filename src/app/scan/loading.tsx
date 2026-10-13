import styles from "./scan.module.css";

export default function LoadingPublicScan() {
  return (
    <main className={styles.section} aria-busy="true" aria-label="Loading QR scanner">
      <div className="mx-auto w-full max-w-2xl animate-pulse">
        <div className="mx-auto h-4 w-40 rounded bg-navy-100" />
        <div className="mx-auto mt-3 h-8 w-64 rounded bg-navy-100" />
        <div className="mx-auto mt-2 h-4 w-96 max-w-full rounded bg-navy-100" />
        <div className="mt-6 rounded-md border border-navy-200 bg-white p-6">
          <div className="h-5 w-32 rounded bg-navy-100" />
          <div className="mt-2 h-4 w-56 rounded bg-navy-100" />
          <div className="mx-auto mt-4 h-48 w-full max-w-md rounded-md bg-navy-100" />
        </div>
      </div>
    </main>
  );
}
