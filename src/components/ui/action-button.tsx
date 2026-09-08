"use client";

import { useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ButtonSize, ButtonVariant } from "@/types";

interface ActionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  onClick: () => Promise<unknown> | void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loadingLabel?: React.ReactNode;
  spinnerClassName?: string;
}

export function ActionButton({
  children,
  onClick,
  variant = "primary",
  size = "md",
  loadingLabel,
  spinnerClassName,
  className,
  disabled,
  ...props
}: ActionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const inFlightRef = useRef(false);

  const handleClick = async () => {
    if (isLoading || inFlightRef.current || disabled) return;

    inFlightRef.current = true;
    setIsLoading(true);

    try {
      await onClick();
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled || isLoading}
      aria-disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={cn("gap-2", className)}
      onClick={handleClick}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2
            className={cn(
              "size-4 shrink-0 animate-spin",
              spinnerClassName
            )}
            aria-hidden="true"
          />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
