// "Choose a password" step shared by activation, password reset and admin invitations.
import { useState } from 'react';
import { Button } from '../../design/primitives';
import { ErrorSummary, PasswordChecklist, PasswordInput } from '../../design/forms';
import { validateNewPassword } from '../../validation';

/** onSubmit(password, confirmPassword) should throw an ApiError on failure. */
export default function NewPasswordForm({ identifiers = [], onSubmit, submitLabel }) {
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateNewPassword(form, identifiers);
    setErrors(errs); setMessage('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSubmit(form.password, form.confirmPassword);
    } catch (err) {
      setErrors(err.fields || {}); setMessage(err.message);
    } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-semibold">New password<span aria-hidden="true" className="text-danger-700"> *</span></label>
        <PasswordInput id="password" value={form.password} onChange={set('password')} autoComplete="new-password" required
          invalid={Boolean(errors.password)} aria-describedby={`password-rules${errors.password ? ' password-error' : ''}`} />
        {errors.password && <p id="password-error" className="text-sm font-medium text-danger-700">{errors.password}</p>}
        <div id="password-rules"><PasswordChecklist password={form.password} identifiers={identifiers} /></div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-semibold">Confirm new password<span aria-hidden="true" className="text-danger-700"> *</span></label>
        <PasswordInput id="confirmPassword" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" required
          invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined} />
        {errors.confirmPassword && <p id="confirmPassword-error" className="text-sm font-medium text-danger-700">{errors.confirmPassword}</p>}
      </div>
      <Button type="submit" size="lg" block disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
    </form>
  );
}
