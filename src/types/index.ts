export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export type UserRole = "super_admin" | "pgso_personnel" | "employee";
export type UserStatus = "active" | "inactive" | "pending";

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  position?: string | null;
  office?: string | null;
  prefix?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  employee_no?: string | null;
  department?: string | null;
  profile_completed?: boolean;
  profile_completed_at?: string | null;
  created_at: string | null;
}

export interface LoginState {
  error?: string;
  /** Set when the password is right but the email is still unverified. */
  email?: string;
  needsVerification?: boolean;
}

export interface SignupState {
  success?: boolean;
  error?: string;
  deliveryId?: string;
  needsVerification?: boolean;
  email?: string;
  /** Role picked at signup — returned so the client can route to the right dashboard. */
  role?: string;
  /** True when a resend request was accepted and a fresh code was emailed. */
  resent?: boolean;
  /** True when the address is already verified — client should point to login. */
  alreadyVerified?: boolean;
}
