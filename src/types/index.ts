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
  created_at: string | null;
}

export interface LoginState {
  error?: string;
}

export interface SignupState {
  success?: boolean;
  error?: string;
  deliveryId?: string;
}
