"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Segment error boundary for the PPMP screens. A dropped action request
 * ("Failed to fetch") shows a retry card instead of the raw runtime overlay.
 */
export default function PpmpError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const network = /fetch|network|load failed/i.test(error.message);
  return (
    <section className="mx-auto grid max-w-xl gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
      <p className="flex items-center gap-2 text-base font-semibold">
        <AlertTriangle size={18} aria-hidden="true" />
        {network ? "Could not reach the server" : "PPMP planning hit an error"}
      </p>
      <p className="leading-relaxed">
        {network
          ? "The request did not complete — usually a flaky connection or a server restart. Your workbooks were not changed."
          : error.message || "Something went wrong while loading this screen."}
      </p>
      <div>
        <Button type="button" variant="warning" size="sm" onClick={reset}>
          <RotateCcw size={13} aria-hidden="true" />
          Try again
        </Button>
      </div>
    </section>
  );
}
