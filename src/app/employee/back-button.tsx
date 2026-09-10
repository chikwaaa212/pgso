"use client";

import { useRouter } from "next/navigation";

export function BackButton({ href = "/employee/dashboard", label = "Back to Dashboard" }: { href?: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      style={{
        display: "inline-block",
        marginBottom: "0.5rem",
        padding: "0.375rem 0.75rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        borderRadius: "0.375rem",
        border: "1px solid var(--color-navy-600)",
        background: "var(--color-navy-900)",
        color: "#fff",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
