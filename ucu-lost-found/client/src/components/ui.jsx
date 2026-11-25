// Small shared UI building blocks: messages, badges, labelled fields, page titles.
import { useEffect, useRef } from 'react';

export function usePageTitle(title) {
  useEffect(() => { document.title = `${title} · UCU Findora`; }, [title]);
}

export function formatDate(d) {
  if (!d) return '';
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d.replace(' ', 'T'));
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** type: success | error | info | warning. role=alert for errors so screen readers announce them. */
export function Alert({ type = 'info', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && <button type="button" className="alert-close" onClick={onClose} aria-label="Dismiss message">×</button>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function EmptyState({ title, children }) {
  return <div className="empty"><h3>{title}</h3>{children && <div>{children}</div>}</div>;
}

const STATUS = {
  open: ['Open', 'st-open'],
  awaiting_collection: ['Awaiting collection', 'st-awaiting'],
  returned: ['Returned', 'st-returned'],
  closed: ['Resolved', 'st-closed'],
  removed: ['Removed', 'st-removed'],
  pending: ['Pending review', 'st-awaiting'],
  approved: ['Approved – collect item', 'st-open'],
  rejected: ['Rejected', 'st-removed'],
  collected: ['Collected', 'st-returned'],
};

export function StatusBadge({ status }) {
  const [label, cls] = STATUS[status] || [status, ''];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function TypeBadge({ type }) {
  return <span className={`badge type-${type}`}>{type === 'lost' ? 'Lost' : 'Found'}</span>;
}

/** Labelled form control with hint + error wired up through aria-describedby. */
export function Field({ id, label, error, hint, required, children }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const control = typeof children === 'function'
    ? children({ id, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': describedBy, required })
    : children;
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}{!required && <span className="optional"> (optional)</span>}</label>
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {control}
      {error && <p className="field-error" id={`${id}-error`}><span aria-hidden="true">⚠ </span>{error}</p>}
    </div>
  );
}

/** Summary of all errors at the top of a form; receives focus so keyboard/screen-reader users find it. */
export function ErrorSummary({ errors, message }) {
  const ref = useRef(null);
  const entries = Object.entries(errors || {});
  useEffect(() => { if ((entries.length || message) && ref.current) ref.current.focus(); }, [errors, message]); // eslint-disable-line
  if (!entries.length && !message) return null;
  return (
    <div className="error-summary" role="alert" tabIndex={-1} ref={ref}>
      <h2>{message || 'Please fix the following:'}</h2>
      {entries.length > 0 && (
        <ul>{entries.map(([k, v]) => <li key={k}><a href={`#${k}`}>{v}</a></li>)}</ul>
      )}
    </div>
  );
}
