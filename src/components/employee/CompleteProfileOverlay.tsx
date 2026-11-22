"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { completeMyProfile } from "@/app/employee/profile-actions";
import {
  PROFILE_PREFIXES,
  PROFILE_SUFFIXES,
} from "@/lib/profile-completion";
import { cn } from "@/lib/utils";
import styles from "./CompleteProfileOverlay.module.css";

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

  const deptInList = departments.some((d) => d.name === form.department);
  const prefixInList = (PROFILE_PREFIXES as readonly string[]).includes(form.prefix);
  const suffixInList = (PROFILE_SUFFIXES as readonly string[]).includes(form.suffix);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-profile-title"
      aria-describedby="complete-profile-sub"
      data-testid="complete-profile-overlay"
    >
      <div className={styles.card}>
        <div className={styles.accent} aria-hidden="true" />

        <header className={styles.header}>
          <div className={styles.headerMeta}>
            <span className={styles.badge}>
              <span className={styles.badgeDot} aria-hidden="true" />
              First-time setup
            </span>
            <span className={styles.step}>Profile · Step 1 of 1</span>
          </div>
          <h2 id="complete-profile-title" className={styles.title}>
            Complete your employee profile
          </h2>
          <p id="complete-profile-sub" className={styles.sub}>
            Your account was just approved{email ? ` (${email})` : ""}. Enter
            your official details once — the portal unlocks as soon as they are
            saved.
          </p>
        </header>

        <form onSubmit={onSubmit} noValidate className={styles.form}>
          <div className={styles.body}>
            <section className={styles.section} aria-labelledby="complete-profile-section-name">
              <div className={styles.sectionHead}>
                <h3 id="complete-profile-section-name" className={styles.sectionTitle}>
                  Personal information
                </h3>
                <span className={styles.sectionRule} aria-hidden="true" />
              </div>

              <div className={styles.grid}>
                <div className={styles.field}>
                  <label htmlFor="complete-profile-prefix" className={styles.label}>
                    Prefix
                  </label>
                  <div className={styles.selectWrap}>
                    <select
                      id="complete-profile-prefix"
                      value={form.prefix}
                      onChange={set("prefix")}
                      disabled={pending}
                      className={cn(styles.input, styles.select, fieldErrors.prefix && styles.invalid)}
                    >
                      <option value="">—</option>
                      {!prefixInList && form.prefix && (
                        <option value={form.prefix}>{form.prefix}</option>
                      )}
                      {PROFILE_PREFIXES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  {fieldErrors.prefix && <p className={styles.fieldError} role="alert">{fieldErrors.prefix}</p>}
                </div>

                <div className={styles.field}>
                  <label htmlFor="complete-profile-suffix" className={styles.label}>
                    Suffix
                  </label>
                  <div className={styles.selectWrap}>
                    <select
                      id="complete-profile-suffix"
                      value={form.suffix}
                      onChange={set("suffix")}
                      disabled={pending}
                      className={cn(styles.input, styles.select, fieldErrors.suffix && styles.invalid)}
                    >
                      <option value="">—</option>
                      {!suffixInList && form.suffix && (
                        <option value={form.suffix}>{form.suffix}</option>
                      )}
                      {PROFILE_SUFFIXES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  {fieldErrors.suffix && <p className={styles.fieldError} role="alert">{fieldErrors.suffix}</p>}
                </div>

                <div className={styles.field}>
                  <label htmlFor="complete-profile-firstname" className={styles.label}>
                    First name <span className={styles.req} aria-hidden="true">*</span>
                  </label>
                  <input
                    id="complete-profile-firstname"
                    value={form.firstName}
                    onChange={set("firstName")}
                    disabled={pending}
                    required
                    aria-required="true"
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

                <div className={styles.field}>
                  <label htmlFor="complete-profile-lastname" className={styles.label}>
                    Last name <span className={styles.req} aria-hidden="true">*</span>
                  </label>
                  <input
                    id="complete-profile-lastname"
                    value={form.lastName}
                    onChange={set("lastName")}
                    disabled={pending}
                    required
                    aria-required="true"
                    autoComplete="family-name"
                    placeholder="Dela Cruz"
                    className={cn(styles.input, fieldErrors.lastName && styles.invalid)}
                  />
                  {fieldErrors.lastName && <p className={styles.fieldError} role="alert">{fieldErrors.lastName}</p>}
                </div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="complete-profile-section-employment">
              <div className={styles.sectionHead}>
                <h3 id="complete-profile-section-employment" className={styles.sectionTitle}>
                  Employment details
                </h3>
                <span className={styles.sectionRule} aria-hidden="true" />
              </div>

              <div className={styles.grid}>
                <div className={styles.field}>
                  <label htmlFor="complete-profile-employeeno" className={styles.label}>
                    Employee ID no. <span className={styles.req} aria-hidden="true">*</span>
                  </label>
                  <input
                    id="complete-profile-employeeno"
                    value={form.employeeNo}
                    onChange={set("employeeNo")}
                    disabled={pending}
                    required
                    aria-required="true"
                    placeholder="e.g. 2024-00123"
                    aria-describedby="complete-profile-employeeno-hint"
                    className={cn(styles.input, fieldErrors.employeeNo && styles.invalid)}
                  />
                  {fieldErrors.employeeNo ? (
                    <p className={styles.fieldError} role="alert">{fieldErrors.employeeNo}</p>
                  ) : (
                    <p id="complete-profile-employeeno-hint" className={styles.hint}>
                      Official government ID — must be unique.
                    </p>
                  )}
                </div>

                <div className={styles.field}>
                  <label htmlFor="complete-profile-position" className={styles.label}>
                    Position <span className={styles.req} aria-hidden="true">*</span>
                  </label>
                  <input
                    id="complete-profile-position"
                    value={form.position}
                    onChange={set("position")}
                    disabled={pending}
                    required
                    aria-required="true"
                    placeholder="e.g. Admin Aide IV"
                    className={cn(styles.input, fieldErrors.position && styles.invalid)}
                  />
                  {fieldErrors.position && <p className={styles.fieldError} role="alert">{fieldErrors.position}</p>}
                </div>

                <div className={styles.field}>
                  <label htmlFor="complete-profile-department" className={styles.label}>
                    Department <span className={styles.req} aria-hidden="true">*</span>
                  </label>
                  {departments.length > 0 ? (
                    <div className={styles.selectWrap}>
                      <select
                        id="complete-profile-department"
                        value={form.department}
                        onChange={set("department")}
                        disabled={pending}
                        required
                        aria-required="true"
                        className={cn(styles.input, styles.select, fieldErrors.department && styles.invalid)}
                      >
                        <option value="" disabled>
                          Select department…
                        </option>
                        {!deptInList && form.department && (
                          <option value={form.department}>{form.department}</option>
                        )}
                        {departments.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input
                      id="complete-profile-department"
                      value={form.department}
                      onChange={set("department")}
                      disabled={pending}
                      required
                      aria-required="true"
                      placeholder="e.g. General Services"
                      className={cn(styles.input, fieldErrors.department && styles.invalid)}
                    />
                  )}
                  {fieldErrors.department && <p className={styles.fieldError} role="alert">{fieldErrors.department}</p>}
                </div>

                <div className={styles.field}>
                  <label htmlFor="complete-profile-office" className={styles.label}>
                    Office <span className={styles.req} aria-hidden="true">*</span>
                  </label>
                  <input
                    id="complete-profile-office"
                    value={form.office}
                    onChange={set("office")}
                    disabled={pending}
                    required
                    aria-required="true"
                    placeholder="e.g. PGSO – Supply Division"
                    className={cn(styles.input, fieldErrors.office && styles.invalid)}
                  />
                  {fieldErrors.office && <p className={styles.fieldError} role="alert">{fieldErrors.office}</p>}
                </div>
              </div>
            </section>

            {formError && (
              <p className={styles.formError} role="alert">
                {formError}
              </p>
            )}
          </div>

          <footer className={styles.footer}>
            <span className={styles.lockNote}>
              <Lock className={styles.lockIcon} aria-hidden="true" />
              Required — this step can&apos;t be skipped.
            </span>
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className={styles.submit}
            >
              {pending ? (
                <>
                  <Loader2 className={styles.spinner} aria-hidden="true" />
                  Saving…
                </>
              ) : (
                <>
                  Save &amp; enter portal
                  <ArrowRight className={styles.submitIcon} aria-hidden="true" />
                </>
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
