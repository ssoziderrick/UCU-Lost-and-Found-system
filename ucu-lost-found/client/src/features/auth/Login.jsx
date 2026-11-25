// Sign-in: students with their registration number, staff with their staff ID (separate API endpoints).
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { IdCard, KeyRound } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import { usePageTitle } from '../../components/ui';
import { Button, Notice, cx } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { ErrorSummary, PasswordInput } from '../../design/forms';
import { validateLogin } from '../../validation';
import AuthFrame from './AuthFrame';

const TABS = [
  { kind: 'student', label: 'Student' },
  { kind: 'admin', label: 'Staff' },
];

export default function Login() {
  usePageTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const kind = params.get('as') === 'staff' ? 'admin' : 'student';
  const [form, setForm] = useState({ registrationNumber: '', staffId: '', password: '', remember: false });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const tabRefs = useRef([]);

  const switchTo = (k) => {
    setParams(k === 'admin' ? { as: 'staff' } : {}, { replace: true, state: location.state });
    setErrors({}); setMessage('');
  };
  const onTabKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    switchTo(TABS[next].kind);
    tabRefs.current[next]?.focus();
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateLogin(form, kind);
    setErrors(errs); setMessage('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body = kind === 'admin'
        ? { staffId: form.staffId, password: form.password }
        : { registrationNumber: form.registrationNumber, password: form.password, remember: form.remember };
      await login(kind, body, (d) => {
        const from = location.state?.from;
        const home = d.user.role === 'admin' ? '/admin' : '/dashboard';
        const allowed = from && (d.user.role === 'admin' ? true : !from.startsWith('/admin'));
        navigate(allowed ? from : home, { replace: true, state: { flash: d.message } });
      });
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
      setForm((f) => ({ ...f, password: '' }));
    } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <AuthFrame title="Sign in" intro={kind === 'student' ? 'Use the registration number on your student ID.' : 'For lost-property staff and administrators.'}>
      {location.state?.flash && !message && <Notice type="info">{location.state.flash}</Notice>}

      <div role="tablist" aria-label="Account type" className="flex w-fit gap-1 rounded-control bg-mist p-1">
        {TABS.map((t, i) => (
          <button key={t.kind} type="button" role="tab" id={`tab-${t.kind}`} aria-selected={kind === t.kind} aria-controls="login-panel"
            tabIndex={kind === t.kind ? 0 : -1} ref={(el) => { tabRefs.current[i] = el; }}
            onClick={() => switchTo(t.kind)} onKeyDown={(e) => onTabKey(e, i)}
            className={cx('min-h-10 rounded-md px-4 text-sm font-semibold transition-colors',
              kind === t.kind ? 'bg-white text-ink shadow-card' : 'text-muted hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>

      <form id="login-panel" role="tabpanel" aria-labelledby={`tab-${kind}`} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
        {kind === 'student' ? (
          <FormField id="registrationNumber" label="Registration number" required error={errors.registrationNumber}
            hint="For example S24B23/101. Upper or lower case both work.">
            {(p) => <input {...p} value={form.registrationNumber} onChange={set('registrationNumber')}
              autoComplete="username" autoCapitalize="characters" spellCheck={false} className={`${p.className} font-mono`} />}
          </FormField>
        ) : (
          <FormField id="staffId" label="Staff ID" required error={errors.staffId}>
            {(p) => <input {...p} value={form.staffId} onChange={set('staffId')}
              autoComplete="username" autoCapitalize="characters" spellCheck={false} className={`${p.className} font-mono`} />}
          </FormField>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="text-sm font-semibold">Password<span aria-hidden="true" className="text-danger-700"> *</span></label>
            <Link to={kind === 'admin' ? '/forgot-password?as=staff' : '/forgot-password'} className="text-sm font-semibold text-brand-700">Forgot password?</Link>
          </div>
          <PasswordInput id="password" value={form.password} onChange={set('password')} autoComplete="current-password"
            required invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} />
          {errors.password && <p id="password-error" className="text-sm font-medium text-danger-700">{errors.password}</p>}
        </div>

        {kind === 'student' && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={form.remember} onChange={set('remember')} className="size-5 accent-brand-600" />
            <span>Keep me signed in for 30 days <span className="text-muted">(only on your own device)</span></span>
          </label>
        )}

        <Button type="submit" size="lg" block disabled={busy} icon={kind === 'admin' ? KeyRound : IdCard}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {kind === 'student' ? (
        <div className="border-t border-line pt-4 text-sm text-muted">
          First time here? <Link to="/activate" className="font-semibold text-brand-700">Activate your student account</Link>.
          We check your registration number against the student registry and send a code to your university email.
        </div>
      ) : (
        <p className="border-t border-line pt-4 text-sm text-muted">
          Staff accounts are created by a super admin, who sends you a link to set your password.
        </p>
      )}
    </AuthFrame>
  );
}
