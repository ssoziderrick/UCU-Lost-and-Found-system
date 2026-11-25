// Password recovery for students (registration number) and staff (staff ID), plus links:
//   /forgot-password            identifier -> emailed code -> new password
//   /reset-password?token=…     emailed reset link or a link handed over by the office
//   /set-password?token=…       invitation for a new administrator
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CircleCheck, MailCheck } from 'lucide-react';
import { api } from '../../api';
import { usePageTitle } from '../../components/ui';
import { Button, Notice, Spinner } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { ErrorSummary, Steps } from '../../design/forms';
import { normaliseId, validateCode } from '../../validation';
import AuthFrame from './AuthFrame';
import NewPasswordForm from './NewPasswordForm';

const STEPS = ['Your account', 'Email code', 'New password'];

export default function Recover() {
  const location = useLocation();
  const [params] = useSearchParams();
  const invite = location.pathname === '/set-password';
  const linkToken = params.get('token');
  const staff = params.get('as') === 'staff';
  usePageTitle(invite ? 'Set your password' : 'Reset your password');

  const [step, setStep] = useState(linkToken ? -1 : 0);
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const checkedLink = useRef(false);
  const idField = staff ? 'staffId' : 'registrationNumber';
  const idLabel = staff ? 'Staff ID' : 'Registration number';

  useEffect(() => {
    if (!linkToken || checkedLink.current) return;
    checkedLink.current = true;
    api.post('/api/auth/password/verify', { token: linkToken })
      .then((d) => { setTicket(d); setStep(2); })
      .catch((e) => { setMessage(e.message); setStep(invite ? -2 : 0); });
  }, [linkToken, invite]);

  const run = async (fn) => {
    setBusy(true); setMessage('');
    try { await fn(); } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  };

  const request = (e) => {
    e?.preventDefault();
    if (!normaliseId(identifier)) { setErrors({ [idField]: `Enter your ${idLabel.toLowerCase()}.` }); return; }
    setErrors({});
    run(async () => {
      const d = await api.post('/api/auth/password/forgot', { [idField]: identifier });
      setNotice(d.message); setStep(1); setCode('');
    });
  };

  const verify = (e) => {
    e.preventDefault();
    const errs = validateCode(code);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    run(async () => {
      const d = await api.post('/api/auth/password/verify', { [idField]: identifier, code: code.trim() });
      setTicket(d); setStep(2);
    });
  };

  const reset = async (password, confirmPassword) => {
    const d = await api.post('/api/auth/password/reset', { ticket: ticket.ticket, password, confirmPassword });
    setDone(d.message); setStep(3);
  };

  const signInLink = ticket?.staffId || staff ? '/login?as=staff' : '/login';

  return (
    <AuthFrame
      title={invite ? 'Set your password' : 'Reset your password'}
      intro={invite ? 'Choose the password you’ll use with your staff ID.' : 'We’ll email a 6-digit code to the address on your account.'}
      aside={<p>For your security, resetting your password signs you out on every device.</p>}
    >
      {!invite && step >= 0 && step < 3 && <Steps steps={STEPS} current={step} />}
      {step === -1 && <Spinner label="Checking your link…" />}
      {step === -2 && (
        <Notice type="error" title="This link can’t be used">
          {message} Ask the super admin who invited you to send a new invitation.
        </Notice>
      )}

      {step === 0 && (
        <form onSubmit={request} noValidate className="flex flex-col gap-4">
          <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
          <FormField id={idField} label={idLabel} required error={errors[idField]}>
            {(p) => <input {...p} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username"
              autoCapitalize="characters" spellCheck={false} className={`${p.className} font-mono`} />}
          </FormField>
          <Button type="submit" size="lg" block disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</Button>
          <p className="text-sm text-muted">
            {staff
              ? <>Not staff? <Link to="/forgot-password" className="font-semibold text-brand-700">Reset a student password</Link>.</>
              : <>Staff member? <Link to="/forgot-password?as=staff" className="font-semibold text-brand-700">Reset with your staff ID</Link>.</>}
            {' '}No email on your account? The lost-property office can reset it in person after checking your ID.
          </p>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={verify} noValidate className="flex flex-col gap-4">
          <Notice type="info" title="Check your email"><span className="text-sm">{notice}</span></Notice>
          <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
          <FormField id="code" label="6-digit code" required error={errors.code}>
            {(p) => <input {...p} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              className={`${p.className} max-w-48 text-center font-mono text-2xl tracking-[0.4em]`} />}
          </FormField>
          <Button type="submit" size="lg" block disabled={busy} icon={MailCheck}>{busy ? 'Checking…' : 'Verify code'}</Button>
          <button type="button" onClick={() => { setStep(0); setErrors({}); setMessage(''); }} className="w-fit text-sm font-semibold text-brand-700">
            Use a different {idLabel.toLowerCase()} or send a new code
          </button>
        </form>
      )}

      {step === 2 && ticket && (
        <>
          <Notice type="success">
            Choosing a password for <strong>{ticket.fullName}</strong>
            {(ticket.registrationNumber || ticket.staffId) && <> · <span className="font-mono">{ticket.registrationNumber || ticket.staffId}</span></>}
          </Notice>
          <NewPasswordForm identifiers={[ticket.registrationNumber, ticket.staffId]} onSubmit={reset}
            submitLabel={ticket.purpose === 'admin_invite' ? 'Set password' : 'Change password'} />
        </>
      )}

      {step === 3 && (
        <div className="flex flex-col items-start gap-4">
          <Notice type="success" title="Password saved">{done}</Notice>
          <Button to={signInLink} size="lg" icon={CircleCheck}>Go to sign in</Button>
        </div>
      )}

      {step !== 3 && <p className="border-t border-line pt-4 text-sm text-muted">Remembered it? <Link to={staff ? '/login?as=staff' : '/login'} className="font-semibold text-brand-700">Sign in</Link></p>}
    </AuthFrame>
  );
}
