"use client";

import { SearchX } from "lucide-react";

import styles from "./empty-search-state.module.css";

interface EmptySearchStateProps {
  /** Headline. Defaults to the wording shared by every Personnel list. */
  title?: string;
  /** One supporting sentence explaining what to try next. */
  description?: string;
  /**
   * When provided, renders the standard secondary "Clear filters" button.
   * Omit it for lists that are simply empty rather than filtered.
   */
  onClear?: () => void;
  clearLabel?: string;
}

/**
 * Shared "nothing matched" state for Personnel tables. Same icon, type scale,
 * spacing, and button as the Stocks ledger so every list reads as one system.
 */
export function EmptySearchState({
  title = "No items match these filters",
  description = "Try a different search term, or clear the filters to see everything again.",
  onClear,
  clearLabel = "Clear filters",
}: EmptySearchStateProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon}>
        <SearchX size={20} aria-hidden="true" />
      </span>
      <p className={styles.title}>{title}</p>
      <p className={styles.text}>{description}</p>
      {onClear ? (
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClear}>
            {clearLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
