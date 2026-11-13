import { cn } from "@/lib/utils";

const BAR_HEIGHTS = [38, 62, 46, 74, 52, 68, 44, 58, 70, 50, 64, 42];

/**
 * Placeholder for the Deliveries vs inspections chart while a new month is
 * being fetched. Mirrors the chart's footprint so the card doesn't jump.
 */
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading chart"
      className={cn(
        "flex h-[280px] w-full animate-pulse items-end gap-2 px-1 pb-6 pt-2",
        className
      )}
    >
      {BAR_HEIGHTS.map((height, i) => (
        <div
          key={i}
          className="flex flex-1 items-end gap-0.5"
          style={{ height: "100%" }}
        >
          <span
            className="w-1/2 rounded-t bg-navy-100"
            style={{ height: `${height}%` }}
          />
          <span
            className="w-1/2 rounded-t bg-navy-100"
            style={{ height: `${Math.max(12, height - 18)}%` }}
          />
        </div>
      ))}
    </div>
  );
}