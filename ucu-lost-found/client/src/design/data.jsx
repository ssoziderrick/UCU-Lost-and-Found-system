// Data display helpers for the admin console: responsive table, pagination, dialog, copyable link.
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, X } from 'lucide-react';
import { Button, cx } from './primitives';

/**
 * Table on wide screens, stacked cards on phones.
 * columns: [{ key, label, render?(row), className?, primary? }] — the primary column becomes the card heading.
 */
export function ResponsiveTable({ columns, rows, rowKey = 'id', caption, empty }) {
  if (!rows.length) return empty || null;
  const primary = columns.find((c) => c.primary) || columns[0];
  const cell = (c, r) => (c.render ? c.render(r) : r[c.key] ?? '—');
  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-line bg-white md:block">
        <table className="w-full text-left text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="border-b border-line bg-mist/60">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r[rowKey]} className="align-top">
                {columns.map((c) => <td key={c.key} className={cx('px-4 py-3', c.className)}>{cell(c, r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={r[rowKey]} className="flex flex-col gap-2 rounded-card border border-line bg-white p-4">
            <div className="font-semibold">{cell(primary, r)}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              {columns.filter((c) => c !== primary).map((c) => (
                <div key={c.key} className="contents">
                  {c.label ? <dt className="text-muted">{c.label}</dt> : <dt className="sr-only">Actions</dt>}
                  <dd className={cx('min-w-0', !c.label && 'col-span-2')}>{cell(c, r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pagination({ page, totalPages, total, onPage, noun = 'results' }) {
  if (!total) return null;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>{total} {noun} · page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" iconRight={ChevronRight} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </nav>
  );
}

/** Modal dialog built on <dialog>: focus is trapped by the browser, Escape closes it. */
export function Dialog({ open, title, onClose, children, width = 'max-w-lg' }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-card border border-line bg-white p-0 text-ink shadow-pop backdrop:bg-ink/50', width)}>
      {open && (
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="-m-2 grid size-10 shrink-0 place-items-center rounded-md hover:bg-mist">
              <X aria-hidden="true" className="size-5" /><span className="sr-only">Close</span>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Shows a one-time link with a copy button (falls back to selecting the text). */
export function CopyableLink({ link }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { inputRef.current?.select(); }
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor="one-time-link" className="sr-only">One-time link</label>
      <input id="one-time-link" ref={inputRef} readOnly value={link} onFocus={(e) => e.target.select()}
        className="min-h-11 flex-1 rounded-control border border-line-strong bg-mist px-3 font-mono text-xs" />
      <Button variant="secondary" icon={Copy} onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
      <span className="sr-only" aria-live="polite">{copied ? 'Link copied to the clipboard' : ''}</span>
    </div>
  );
}

export const formatDateTime = (v) => (v
  ? new Date(String(v).replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');
