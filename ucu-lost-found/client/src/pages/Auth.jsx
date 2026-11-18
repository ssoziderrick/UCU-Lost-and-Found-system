import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { validateLogin, validateRegister } from '../validation';
import { Alert, ErrorSummary, Field, usePageTitle } from '../components/ui';

export function Login() {
  usePageTitle('Log in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const from = location.state?.from || '/';

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateLogin(form);
    setErrors(errs); setMessage('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const d = await login(form.email, form.password);
      navigate(d.user.role === 'admin' && from === '/' ? '/admin' : from, { replace: true, state: { flash: d.message } });
    } catch (err) {
      setErrors(err.fields || {}); setMessage(err.message);
    } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="auth-wrap card">
      <h1>Log in</h1>
      {location.state?.flash && !message && <Alert type="info">{location.state.flash}</Alert>}
      <form onSubmit={submit} noValidate>
        {Object.keys(errors).length ? <ErrorSummary errors={errors} /> : <Alert type="error">{message}</Alert>}
        <Field id="email" label="Email" required error={errors.email}>
          {(p) => <input {...p} type="email" autoComplete="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field id="password" label="Password" required error={errors.password}>
          {(p) => <input {...p} type="password" autoComplete="current-password" value={form.password} onChange={set('password')} />}
        </Field>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="auth-alt">New here? <Link to="/register" state={location.state}>Create a student account</Link></p>
    </div>
  );
}

export function Register() {
  usePageTitle('Create an account');
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ fullName: '', email: '', studentNumber: '', phone: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateRegister(form);
    setErrors(errs); setMessage('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { confirmPassword, ...payload } = form; // eslint-disable-line no-unused-vars
      const d = await register(payload);
      navigate(location.state?.from || '/', { replace: true, state: { flash: d.message } });
    } catch (err) {
      setErrors(err.fields || {}); setMessage(err.message);
    } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="auth-wrap card">
      <h1>Create a student account</h1>
      <p>Use your own details. Your phone number and email are never shown in public listings.</p>
      <form onSubmit={submit} noValidate>
        {Object.keys(errors).length ? <ErrorSummary errors={errors} /> : <Alert type="error">{message}</Alert>}
        <Field id="fullName" label="Full name" required error={errors.fullName}>
          {(p) => <input {...p} autoComplete="name" value={form.fullName} onChange={set('fullName')} />}
        </Field>
        <Field id="email" label="Email" required error={errors.email}>
          {(p) => <input {...p} type="email" autoComplete="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field id="studentNumber" label="Student number" error={errors.studentNumber} hint="Helps the office confirm your identity at collection.">
          {(p) => <input {...p} value={form.studentNumber} onChange={set('studentNumber')} />}
        </Field>
        <Field id="phone" label="Phone number" error={errors.phone} hint="Visible only to the administrator.">
          {(p) => <input {...p} type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />}
        </Field>
        <Field id="password" label="Password" required error={errors.password} hint="At least 8 characters, including a letter and a number.">
          {(p) => <input {...p} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />}
        </Field>
        <Field id="confirmPassword" label="Confirm password" required error={errors.confirmPassword}>
          {(p) => <input {...p} type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} />}
        </Field>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="auth-alt">Already registered? <Link to="/login" state={location.state}>Log in</Link></p>
    </div>
  );
}
