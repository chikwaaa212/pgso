"use client";

import { useState, createContext, useContext, useCallback } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";

interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "error";
  duration?: number;
}

interface ToastContextType {
  toast: (data: Omit<ToastData, "id">) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const TOAST_VARIANTS = {
  default: "border-navy-200 bg-white text-navy-900",
  success: "border-navy-700 bg-navy-100 text-navy-900",
  error: "border-red-200 bg-red-50 text-red-900",
} satisfies Record<string, string>;

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback((data: Omit<ToastData, "id">) => {
    const id = crypto.randomUUID();
    const toast: ToastData = { id, ...data };
    setToasts((prev) => [...prev, toast]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      data.duration ?? 5000
    );
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider>
        {children}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" />
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            open
            className={cn(
              "group pointer-events-auto relative flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 text-sm shadow-lg",
              "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=closed]:zoom-out-95",
              "data-[state=delayed-open]:zoom-in-95",
              TOAST_VARIANTS[t.variant ?? "default"]
            )}
          >
            <div className="flex-1">
              <ToastPrimitive.Title className="font-semibold">
                {t.title}
              </ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="mt-1 text-sm opacity-80">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close asChild>
              <button
                type="button"
                className="rounded-full border border-navy-200 bg-white px-2 py-0.5 text-xs text-navy-700 opacity-70 hover:bg-navy-100 hover:opacity-100"
                aria-label="Close toast"
              >
                Close
              </button>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
};
