// Labelled form controls. Hint and error text are linked to the control with aria-describedby,
// and the control is marked aria-invalid when there is an error.
import { cx } from './primitives';

export const controlClasses = (invalid) => cx(
  'block w-full min-h-11 rounded-control border bg-white px-3 py-2 text-ink placeholder:text-muted/80',
  'focus:outline-none focus-visible:outline-none focus:ring-3 focus:ring-brand-200',
  invalid ? 'border-danger-700 focus:border-danger-700' : 'border-line-strong focus:border-brand-600',
);

/**
 * <FormField id label error hint required>{(props) => <input {...props} />}</FormField>
 * The render function receives id, aria-invalid, aria-describedby, required and className.
 */
export function FormField({ id, label, error, hint, required, optionalLabel = true, children, className }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const control = children({
    id,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy,
    required,
    className: controlClasses(Boolean(error)),
  });
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required && <span aria-hidden="true" className="text-danger-700"> *</span>}
        {!required && optionalLabel && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
      {control}
      {error && <p id={`${id}-error`} className="text-sm font-medium text-danger-700">{error}</p>}
    </div>
  );
}
