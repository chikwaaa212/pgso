/**
 * Human-friendly labels for machine values shown in the UI.
 * "in_progress" → "In progress", "users:approve_employee" → "Users: Approve employee".
 * Keeps every pill, badge and table cell starting with a capital letter.
 */
export function label(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const text = String(value).trim();
  if (!text) return '—';
  return text
    .split(':')
    .map((segment) =>
      segment
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^./, (c) => c.toUpperCase())
    )
    .join(': ');
}
