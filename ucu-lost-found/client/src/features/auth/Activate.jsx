// First-time activation: registration number + name -> emailed 6-digit code (or link) -> choose a password.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import { usePageTitle } from '../../components/ui';
import { Button, Notice, Spinner } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { ErrorSummary, Steps } from '../../design/forms';
import { validateActivationStart, validateCode } from '../../validation';
import AuthFrame from './AuthFrame';
import NewPasswordForm from './NewPasswordForm';

const STEPS = ['Your details', 'Email code', 'Password'];

export default function Activate() {
  usePageTitle('Activate your account');
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const linkToken = params.get('token');
  const [step, setStep] = useState(linkToken ? -1 : 0); // -1 = checking a link
  const [details, setDetails] = useState({ registrationNumber: '', fullName: '' });
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const checkedLink = useRef(false);

  useEffect(() => {
    if (!cooldown) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Opened from the emailed link (or an office link): verify it straight away.
  useEffect(() => {
    if (!linkToken || checkedLink.current) return;
    checkedLink.current = true;
    api.post('/api/auth/activate/verify', { token: linkToken })
      .then((d) => { setTicket(d); setStep(2); })
      .catch((e) => { setMessage(`${e.message} You can also enter your details below to get a new code.`); setStep(0); });
  }, [linkToken]);

  const run = async (fn) => {
    setBusy(true); setMessage('');
    try { await fn(); } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  };

  const sendCode = (e) => {
    e?.preventDefault();
    const errs = validateActivationStart(details);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    run(async () => {
      const d = await api.post('/api/auth/activate/start', details);
      setNotice(d.message); setStep(1); setCooldown(60); setCode('');
    });
  };

  const verify = (e) => {
    e.preventDefault();
    const errs = validateCode(code);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    run(async () => {
      const d = await api.post('/api/auth/activate/verify', { registrationNumber: details.registrationNumber, code: code.trim() });
      setTicket(d); setStep(2);
    });
  };

  const complete = async (password, confirmPassword) => {
    const d = await api.post('/api/auth/activate/complete', { ticket: ticket.ticket, password, confirmPassword });
    signedIn(d.user, () => navigate('/dashboard', { replace: true, state: { flash: d.message } }));
  };

  const set = (k) => (e) => setDetails((d) => ({ ...d, [k]: e.target.value }));

  return (
    <AuthFrame
      title="Activate your account"
      intro="Students activate once with their registration number. After that, sign in with it and your password."
      aside={<p>Your registration number is checked against the university’s student registry. We never ask for your university email password.</p>}
    >
      {step >= 0 && <Steps steps={STEPS} current={step} />}

      {step === -1 && <Spinner label="Checking your activation link…" />}

      {step === 0 && (
        <form onSubmit={sendCode} noValidate className="flex flex-col gap-4">
          <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
          <FormField id="registrationNumber" label="Registration number" required error={errors.registrationNumber} hint="As printed on your student ID, e.g. S24B23/101.">
            {(p) => <input {...p} value={details.registrationNumber} onChange={set('registrationNumber')} autoComplete="username"
              autoCapitalize="characters" spellCheck={false} className={`${p.className} font-mono`} />}
          </FormField>
          <FormField id="fullName" label="Full name" required error={errors.fullName} hint="As registered with the university. Word order doesn’t matter.">
            {(p) => <input {...p} value={details.fullName} onChange={set('fullName')} autoComplete="name" />}
          </FormField>
          <Button type="submit" size="lg" block disabled={busy}>{busy ? 'Checking…' : 'Send my code'}</Button>
          <p className="text-sm text-muted">
            No university email, or no code after a few minutes? Visit the lost-property office with your student ID and they can activate your account with you.
          </p>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={verify} noValidate className="flex flex-col gap-4">
          <Notice type="info" title="Check your university email"><span className="text-sm">{notice}</span></Notice>
          <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
          <FormField id="code" label="6-digit code" required error={errors.code}>
            {(p) => <input {...p} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              className={`${p.className} max-w-48 text-center font-mono text-2xl tracking-[0.4em]`} />}
          </FormField>
          <Button type="submit" size="lg" block disabled={busy} icon={MailCheck}>{busy ? 'Checking…' : 'Verify code'}</Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" onClick={() => { setStep(0); setErrors({}); setMessage(''); }} className="font-semibold text-brand-700">Change my details</button>
            <button type="button" onClick={sendCode} disabled={cooldown > 0 || busy} className="font-semibold text-brand-700 disabled:text-muted">
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
            </button>
          </div>
        </form>
      )}

      {step === 2 && ticket && (
        <>
          <Notice type="success">Verified: <strong>{ticket.fullName}</strong> · <span className="font-mono">{ticket.registrationNumber}</span></Notice>
          <NewPasswordForm identifiers={[ticket.registrationNumber]} onSubmit={complete} submitLabel="Activate and sign in" />
        </>
      )}

      <p className="border-t border-line pt-4 text-sm text-muted">Already activated? <Link to="/login" className="font-semibold text-brand-700">Sign in</Link></p>
    </AuthFrame>
  );
}
