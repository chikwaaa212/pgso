import { ButtonVariant, ButtonSize } from "@/types";

export const SITE_CONFIG = {
  name: "PGSO",
  description: "A Next.js 15+ project scaffold",
  nav: [
    { label: "Home", href: "/" },
    { label: "Health", href: "/api/health" },
  ],
} as const;

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800",
  secondary: "bg-yellow-100 text-navy-900 hover:bg-yellow-500",
  outline: "border border-navy-200 bg-transparent hover:bg-yellow-100",
  ghost: "bg-transparent hover:bg-yellow-100",
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4",
  lg: "h-12 px-6 text-lg",
};
