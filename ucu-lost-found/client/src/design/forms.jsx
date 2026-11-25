// Form helpers shared by the new pages: error summary, password field with show/hide, step indicator.
import { useEffect, useId, useRef, useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { cx } from './primitives';
import { controlClasses } from './FormField';

/**
 * Lists field errors at the top of a form and takes focus, so keyboard and screen-reader users find them.
 * Each item links to its field by id.
 */
export function ErrorSummary({ errors, message }) {
  const ref = useRef(null);
  const entries = Object.entries(errors || {});
  const show = entries.length > 0 || Boolean(message);
  useEffect(() => { if (show) ref.current?.focus(); }, [errors, message, show]);
  if (!show) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert"
      className="rounded-card border border-danger-700/30 bg-danger-50 px-4 py-3 text-danger-800 focus:outline-none focus-visible:ring-3 focus-visible:ring-danger-700/30">
      <p className="font-semibold">
        {message && !entries.some(([, v]) => v === message) ? message : 'Please check the highlighted fields.'}
      </p>
      {entries.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-sm">
          {entries.map(([k, v]) => <li key={k}><a href={`#${k}`} className="text-danger-800 underline">{v}</a></li>)}
        </ul>
      )}
    </div>
  );
}

/** Password input with a show/hide toggle. Props are passed to the <input>. */
export function PasswordInput({ id, invalid, className, ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={shown ? 'text' : 'password'} spellCheck={false} autoCapitalize="none"
        className={cx(controlClasses(invalid), 'pr-24', className)} aria-invalid={invalid ? 'true' : undefined} {...props} />
      <button type="button" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-controls={id}
        className="absolute inset-y-1 right-1 flex items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-ink hover:bg-mist">
        {shown ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        {shown ? 'Hide' : 'Show'}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}

/** Live checklist under a new-password field. The server remains the authority. */
export function PasswordChecklist({ password, identifiers = [] }) {
  const squashed = (password || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rules = [
    ['At least 10 characters', (password || '').length >= 10],
    ['A letter and a number', /[A-Za-z]/.test(password || '') && /\d/.test(password || '')],
    ['Doesn’t contain your registration number or staff ID', !identifiers.some((id) => {
      const s = String(id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return s.length >= 4 && squashed.includes(s);
    })],
  ];
  const listId = useId();
  return (
    <ul id={listId} aria-label="Password requirements" className="flex flex-col gap-1 text-sm">
      {rules.map(([label, ok]) => (
        <li key={label} className={cx('flex items-center gap-2', ok && password ? 'text-success-700' : 'text-muted')}>
          <span aria-hidden="true" className={cx('grid size-4 place-items-center rounded-full border',
            ok && password ? 'border-success-700 bg-success-700 text-white' : 'border-line-strong')}>
            {ok && password && <Check className="size-3" strokeWidth={3} />}
          </span>
          {label}<span className="sr-only">{ok && password ? ': done' : ': not yet'}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Step 2 of 3" indicator for multi-step flows. */
export function Steps({ steps, current }) {
  return (
    <ol className="flex items-center gap-2 text-xs font-medium text-muted" aria-label={`Step ${current + 1} of ${steps.length}`}>
      {steps.map((label, i) => (
        <li key={label} className="flex items-center gap-2" aria-current={i === current ? 'step' : undefined}>
          {i > 0 && <span aria-hidden="true" className={cx('h-0.5 w-5 rounded', i <= current ? 'bg-brand-600' : 'bg-line')} />}
          <span aria-hidden="true" className={cx('grid size-5 place-items-center rounded-full text-[0.7rem] font-bold',
            i < current ? 'bg-brand-600 text-white' : i === current ? 'bg-brand-50 text-brand-800 ring-2 ring-brand-600' : 'bg-mist text-muted')}>
            {i < current ? <Check className="size-3" strokeWidth={3} /> : i + 1}
          </span>
          <span className={cx('hidden sm:inline', i === current && 'text-ink')}>{label}</span>
        </li>
      ))}
    </ol>
  );
}
