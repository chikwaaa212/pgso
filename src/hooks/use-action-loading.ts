import { useState, useRef, useCallback } from "react";

type AnyArgs = unknown[];

export interface UseActionLoadingResult<TArgs extends AnyArgs, TResult> {
  isLoading: boolean;
  execute: (...args: TArgs) => Promise<TResult | undefined>;
}

export function useActionLoading<TArgs extends AnyArgs, TResult = unknown>(
  action: (...args: TArgs) => Promise<TResult>
): UseActionLoadingResult<TArgs, TResult> {
  const [isLoading, setIsLoading] = useState(false);
  const inFlightRef = useRef(false);

  const execute = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (inFlightRef.current) return undefined;

      inFlightRef.current = true;
      setIsLoading(true);

      try {
        return await action(...args);
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [action]
  );

  return { isLoading, execute };
}
