// Core UCU Findora components. Colours and type come from the @theme tokens in index.css.
import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Button: renders <button>, or a router <Link> when `to` is given.
const BUTTON_BASE = 'inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap '
  + 'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55 no-underline';
const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-800 hover:text-white',
  secondary: 'border border-line-strong bg-white text-ink hover:border-brand-600 hover:text-brand-800',
  subtle: 'bg-brand-50 text-brand-800 hover:bg-brand-100 hover:text-brand-900',
  ghost: 'text-ink hover:bg-mist hover:text-brand-800',
  danger: 'bg-danger-700 text-white hover:bg-danger-800 hover:text-white',
  success: 'bg-success-700 text-white hover:bg-success-800 hover:text-white',
  inverse: 'bg-white text-brand-800 hover:bg-brand-50 hover:text-brand-900',
};
const BUTTON_SIZES = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-[0.95rem]',
  lg: 'min-h-12 px-5 text-base',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', to, state, block, icon: Icon, iconRight: IconRight, className, children, type, ...rest },
  ref,
) {
  const classes = cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], block && 'w-full', className);
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" className="size-[1.1em] shrink-0" strokeWidth={2.2} />}
      {children}
      {IconRight && <IconRight aria-hidden="true" className="size-[1.1em] shrink-0" strokeWidth={2.2} />}
    </>
  );
  if (to) return <Link ref={ref} to={to} state={state} className={classes} {...rest}>{content}</Link>;
  return <button ref={ref} type={type || 'button'} className={classes} {...rest}>{content}</button>;
});

// ---------------------------------------------------------------------------
// Badges
const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-50 text-brand-800',
  signal: 'bg-signal-100 text-signal-700',
  success: 'bg-success-100 text-success-800',
  warning: 'bg-warning-100 text-warning-800',
  danger: 'bg-danger-100 text-danger-800',
};

export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold leading-none', BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS = {
  open: ['Open', 'brand'],
  awaiting_collection: ['Awaiting collection', 'warning'],
  returned: ['Returned', 'neutral'],
  closed: ['Resolved', 'neutral'],
  removed: ['Removed', 'danger'],
  pending: ['Under review', 'warning'],
  approved: ['Approved, collect item', 'brand'],
  rejected: ['Rejected', 'danger'],
  collected: ['Collected', 'success'],
};

export function StatusBadge({ status }) {
  const [label, tone] = STATUS[status] || [status, 'neutral'];
  return <Badge tone={tone}>{label}</Badge>;
}

export function TypeBadge({ type }) {
  return type === 'lost' ? <Badge tone="danger">Lost</Badge> : <Badge tone="success">Found</Badge>;
}

// ---------------------------------------------------------------------------
// Surfaces and layout helpers
export function Card({ as: Tag = 'div', className, children, ...rest }) {
  return <Tag className={cx('rounded-card border border-line bg-white', className)} {...rest}>{children}</Tag>;
}

export function PageHeader({ eyebrow, title, description, actions, id }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && <p className="text-sm font-medium text-muted">{eyebrow}</p>}
        <h1 id={id} className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {description && <p className="max-w-prose text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A labelled count. `value` must come from real data; pass null while loading. */
export function StatCard({ label, value, detail, tone = 'default', icon: Icon }) {
  return (
    <Card className={cx('flex flex-col gap-1 p-4', tone === 'signal' && 'border-signal-300')}>
      <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
        {Icon && <Icon aria-hidden="true" className="size-4" />}{label}
      </span>
      <strong className={cx('font-display text-[1.65rem] leading-tight tabular-nums', tone === 'signal' ? 'text-signal-600' : 'text-ink')}>
        {value ?? <span className="inline-block h-7 w-10 animate-pulse rounded bg-mist align-middle" aria-label="Loading" />}
      </strong>
      {detail && <span className="text-xs text-muted">{detail}</span>}
    </Card>
  );
}

export function Spinner({ label = 'Loading…', className }) {
  return (
    <div role="status" aria-live="polite" className={cx('flex items-center gap-3 py-8 text-muted', className)}>
      <span aria-hidden="true" className="size-5 animate-spin rounded-full border-[3px] border-line border-t-brand-600" />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-white px-6 py-10 text-center">
      {Icon && <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon aria-hidden="true" className="size-6" /></span>}
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <div className="max-w-prose text-muted">{children}</div>}
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notice: inline message. Errors use role="alert" so screen readers announce them.
const NOTICE = {
  info: ['border-brand-200 bg-brand-50 text-brand-900', Info],
  success: ['border-success-700/25 bg-success-50 text-success-800', CircleCheck],
  warning: ['border-warning-700/30 bg-warning-50 text-warning-800', TriangleAlert],
  error: ['border-danger-700/25 bg-danger-50 text-danger-800', CircleAlert],
};

export function Notice({ type = 'info', title, children, onClose, className }) {
  if (!children && !title) return null;
  const [classes, Icon] = NOTICE[type];
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-card border px-4 py-3', classes, className)}>
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss message" className="-m-1 grid size-8 place-items-center rounded-md hover:bg-black/5">
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
