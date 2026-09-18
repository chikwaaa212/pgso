"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { completeMyProfile } from "@/app/employee/profile-actions";
import {
  PROFILE_PREFIXES,
  PROFILE_SUFFIXES,
} from "@/lib/profile-completion";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import styles from "./CompleteProfileOverlay.module.css";

const NONE_VALUE = "__none__";

export interface ProfileOverlayInitial {
  prefix: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  employeeNo: string;
  department: string;
  position: string;
  office: string;
}

const EMPTY: ProfileOverlayInitial = {
  prefix: "",
  firstName: "",
  middleName: "",
  lastName: "",
  suffix: "",
  employeeNo: "",
  department: "",
  position: "",
  office: "",
};

/**
 * Blocking first-login overlay. Rendered by the employee layout when
 * `profile_completed` is false — no close button, no backdrop dismiss, so
 * the employee must complete their profile to enter the portal.
 */
export function CompleteProfileOverlay({
  initial,
  departments,
  email,
}: {
  initial?: Partial<ProfileOverlayInitial> | null;
  departments: { id: string; name: string }[];
  email?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<ProfileOverlayInitial>({ ...EMPTY, ...initial });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProfileOverlayInitial, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Lock background scroll + focus the dialog while it is mounted.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.getElementById("complete-profile-firstname")?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const set = (key: keyof ProfileOverlayInitial) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setFieldErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  const setSelect = (key: keyof ProfileOverlayInitial) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value === NONE_VALUE ? "" : value }));
    setFieldErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs: typeof fieldErrors = {};
    if (!form.firstName.trim()) errs.firstName = "First name is required.";
    if (!form.lastName.trim()) errs.lastName = "Last name is required.";
    if (!form.employeeNo.trim()) errs.employeeNo = "Employee ID is required.";
    if (!form.department.trim()) errs.department = "Department is required.";
    if (!form.position.trim()) errs.position = "Position is required.";
    if (!form.office.trim()) errs.office = "Office is required.";
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setFormError("Please fill in all required fields.");
      return;
    }
    start(async () => {
      const res = await completeMyProfile({
        prefix: form.prefix,
        firstName: form.firstName,
        middleName: form.middleName,
        lastName: form.lastName,
        suffix: form.suffix,
        employeeNo: form.employeeNo,
        department: form.department,
        position: form.position,
        office: form.office,
      });
      if (res.success) {
        router.refresh();
      } else {
        setFormError(res.error ?? "Could not save your profile.");
        if (res.fieldErrors) {
          setFieldErrors((prev) => ({ ...prev, ...res.fieldErrors }));
        }
      }
    });
  }

  const showDeptSelect = departments.length > 0;
  const deptInList = departments.some((d) => d.name === form.department);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-profile-title"
      data-testid="complete-profile-overlay"
    >
      <div className={styles.card}>
        <p className={styles.eyebrow}>First-time setup · required</p>
        <h2 id="complete-profile-title" className={styles.title}>
          Complete your employee profile
        </h2>
        <p className={styles.sub}>
          Your account was just approved{email ? ` (${email})` : ""}. Fill in
          your official details once to enter the portal. You can&apos;t use
          the system until this is saved.
        </p>

        <form onSubmit={onSubmit} noValidate className={styles.form}>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="complete-profile-prefix" className={styles.label}>
                Prefix
              </label>
              <Select
                value={form.prefix || undefined}
                onValueChange={setSelect("prefix")}
                disabled={pending}
              >
                <SelectTrigger
                  id="complete-profile-prefix"
                  aria-label="Prefix"
                  className={cn(styles.input, "flex w-full", fieldErrors.prefix && styles.invalid)}
                >
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value={NONE_VALUE}>—</SelectItem>
                  {PROFILE_PREFIXES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.prefix && <p className={styles.fieldError} role="alert">{fieldErrors.prefix}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="complete-profile-suffix" className={styles.label}>
                Suffix
              </label>
              <Select
                value={form.suffix || undefined}
                onValueChange={setSelect("suffix")}
                disabled={pending}
              >
                <SelectTrigger
                  id="complete-profile-suffix"
                  aria-label="Suffix"
                  className={cn(styles.input, "flex w-full", fieldErrors.suffix && styles.invalid)}
                >
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value={NONE_VALUE}>—</SelectItem>
                  {PROFILE_SUFFIXES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.suffix && <p className={styles.fieldError} role="alert">{fieldErrors.suffix}</p>}
            </div>
          </div>

          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="complete-profile-firstname" className={styles.label}>
                First name *
              </label>
              <input
                id="complete-profile-firstname"
                value={form.firstName}
                onChange={set("firstName")}
                disabled={pending}
                autoComplete="given-name"
                placeholder="Juan"
                className={cn(styles.input, fieldErrors.firstName && styles.invalid)}
              />
              {fieldErrors.firstName && <p className={styles.fieldError} role="alert">{fieldErrors.firstName}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="complete-profile-middlename" className={styles.label}>
                Middle name
              </label>
              <input
                id="complete-profile-middlename"
                value={form.middleName}
                onChange={set("middleName")}
                disabled={pending}
                autoComplete="additional-name"
                placeholder="Santos"
                className={cn(styles.input, fieldErrors.middleName && styles.invalid)}
              />
              {fieldErrors.middleName && <p className={styles.fieldError} role="alert">{fieldErrors.middleName}</p>}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="complete-profile-lastname" className={styles.label}>
              Last name *
            </label>
            <input
              id="complete-profile-lastname"
              value={form.lastName}
              onChange={set("lastName")}
              disabled={pending}
              autoComplete="family-name"
              placeholder="Dela Cruz"
              className={cn(styles.input, fieldErrors.lastName && styles.invalid)}
            />
            {fieldErrors.lastName && <p className={styles.fieldError} role="alert">{fieldErrors.lastName}</p>}
          </div>

          <div className={styles.field}>
            <label htmlFor="complete-profile-employeeno" className={styles.label}>
              Employee ID no. *
            </label>
            <input
              id="complete-profile-employeeno"
              value={form.employeeNo}
              onChange={set("employeeNo")}
              disabled={pending}
              placeholder="e.g. 2024-00123"
              className={cn(styles.input, fieldErrors.employeeNo && styles.invalid)}
            />
            {fieldErrors.employeeNo ? (
              <p className={styles.fieldError} role="alert">{fieldErrors.employeeNo}</p>
            ) : (
              <p className={styles.hint}>Your official government employee ID — must be unique.</p>
            )}
          </div>

          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="complete-profile-department" className={styles.label}>
                Department *
              </label>
              {showDeptSelect ? (
                <Select
                  value={
                    deptInList || !form.department ? form.department || undefined : "__other__"
                  }
                  onValueChange={(v) => {
                    if (v !== "__other__") {
                      setForm((f) => ({ ...f, department: v }));
                      setFieldErrors((errs) => ({ ...errs, department: undefined }));
                    }
                  }}
                  disabled={pending}
                >
                  <SelectTrigger
                    id="complete-profile-department"
                    aria-label="Department"
                    className={cn(styles.input, "flex w-full", fieldErrors.department && styles.invalid)}
                  >
                    <SelectValue placeholder="Select department…" />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                    {!deptInList && form.department && (
                      <SelectItem value="__other__">Keep: {form.department}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <input
                  id="complete-profile-department"
                  value={form.department}
                  onChange={set("department")}
                  disabled={pending}
                  placeholder="e.g. General Services"
                  className={cn(styles.input, fieldErrors.department && styles.invalid)}
                />
              )}
              {fieldErrors.department && <p className={styles.fieldError} role="alert">{fieldErrors.department}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="complete-profile-position" className={styles.label}>
                Position *
              </label>
              <input
                id="complete-profile-position"
                value={form.position}
                onChange={set("position")}
                disabled={pending}
                placeholder="e.g. Admin Aide IV"
                className={cn(styles.input, fieldErrors.position && styles.invalid)}
              />
              {fieldErrors.position && <p className={styles.fieldError} role="alert">{fieldErrors.position}</p>}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="complete-profile-office" className={styles.label}>
              Office *
            </label>
            <input
              id="complete-profile-office"
              value={form.office}
              onChange={set("office")}
              disabled={pending}
              placeholder="e.g. PGSO – Supply Division"
              className={cn(styles.input, fieldErrors.office && styles.invalid)}
            />
            {fieldErrors.office && <p className={styles.fieldError} role="alert">{fieldErrors.office}</p>}
          </div>

          {formError && (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            aria-busy={pending}
            className={styles.submit}
          >
            {pending ? (
              <>
                <Loader2 className={styles.spinner} aria-hidden="true" />
                Saving profile…
              </>
            ) : (
              "Save & enter portal"
            )}
          </Button>
          <p className={styles.lockNote}>This step is required — there is no skip.</p>
        </form>
      </div>
    </div>
  );
}
