import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type SpinnerSize = "sm" | "md" | "lg";

const SPINNER_SIZES: Record<SpinnerSize, string> = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
};

interface SpinnerProps {
  className?: string;
  size?: SpinnerSize;
}

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin shrink-0", SPINNER_SIZES[size], className)}
      aria-hidden="true"
    />
  );
}
