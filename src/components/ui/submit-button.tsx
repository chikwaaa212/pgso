"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ButtonSize, ButtonVariant } from "@/types";

interface SubmitButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pendingLabel?: React.ReactNode;
  spinnerClassName?: string;
}

/**
 * Drop-in submit button for server-action forms.
 *
 * While the form's action is running it shows a spinner, switches to the
 * pending label, and stays disabled — so rapid clicks can't fire duplicate
 * requests. Pair with a server-side idempotency key for full protection.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  spinnerClassName,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={pending}
      className={cn("gap-2", className)}
      {...props}
    >
      {pending ? (
        <>
          <Loader2
            className={cn("size-4 shrink-0 animate-spin", spinnerClassName)}
            aria-hidden="true"
          />
          {pendingLabel !== undefined ? pendingLabel : children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
