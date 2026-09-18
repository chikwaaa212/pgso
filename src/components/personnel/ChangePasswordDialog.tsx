"use client";

// Backwards-compat re-export — the dialog now lives in the shared account
// folder so personnel + super-admin navbars use the same implementation.
export {
  ChangePasswordDialog,
  PASSWORD_RULES,
  validatePassword,
  type PasswordRule,
} from "@/components/account/ChangePasswordDialog";
