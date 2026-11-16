/**
 * Shared loading skeleton for the QR scanner pages.
 *
 * Mirrors the live layout (header, camera card, result area, side guide) so
 * the page swaps in without a layout jump when the client component mounts.
 */
export function QrScannerSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-[80rem] animate-pulse flex-col gap-5 pt-2 pb-4"
      aria-hidden="true"
    >
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 rounded bg-navy-100" />
        <div className="h-8 w-48 rounded bg-navy-100" />
        <div className="h-4 w-full max-w-lg rounded bg-navy-100" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-navy-200 bg-white p-4">
            <div className="h-4 w-28 rounded bg-navy-100" />
            <div className="mt-1.5 h-3 w-64 max-w-full rounded bg-navy-100" />
            <div className="mt-4 aspect-[4/3] w-full rounded-xl bg-navy-900" />
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="h-8 w-32 rounded-full bg-navy-100" />
              <div className="h-8 w-28 rounded-full bg-navy-100" />
              <div className="h-8 w-24 rounded-full bg-navy-100" />
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-navy-200 bg-navy-100/50 p-6">
            <div className="mx-auto h-4 w-40 rounded bg-navy-100" />
            <div className="mx-auto mt-2 h-3 w-72 max-w-full rounded bg-navy-100" />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {[0, 1].map((card) => (
            <div
              key={card}
              className="rounded-xl border border-navy-200 bg-white p-4"
            >
              <div className="h-4 w-36 rounded bg-navy-100" />
              <div className="mt-3 flex flex-col gap-2.5">
                <div className="h-8 w-full rounded bg-navy-100" />
                <div className="h-8 w-full rounded bg-navy-100" />
                <div className="h-8 w-4/5 rounded bg-navy-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
