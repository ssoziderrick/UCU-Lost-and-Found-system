// Administrators: invite by email, change role, deactivate / reactivate. Super admins only.
import { useEffect, useState } from 'react';
import { ShieldCheck, UserCheck, UserPlus, UserX } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import { usePageTitle } from '../../components/ui';
import { Badge, Button, Card, Notice, PageHeader, Spinner } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { ErrorSummary, PasswordInput } from '../../design/forms';
import { Dialog, ResponsiveTable, formatDateTime } from '../../design/data';

const ROLE_TONE = { super_admin: 'brand', officer: 'neutral', viewer: 'neutral' };

export default function Admins() {
  usePageTitle('Administrators');
  const { user } = useAuth();
  const [admins, setAdmins] = useState(null);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [dialog, setDialog] = useState(null);

  const load = () => Promise.all([api.get('/api/admin/admins'), api.get('/api/admin/roles')])
    .then(([a, r]) => { setAdmins(a.items); setRoles(r.items); })
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const done = (msg) => { setFlash(msg); setDialog(null); load(); };

  const columns = [
    { key: 'name', label: 'Administrator', primary: true, render: (a) => (
      <div className="flex flex-col">
        <span className="font-semibold">{a.fullName}{a.id === user.id && <span className="font-normal text-muted"> (you)</span>}</span>
        <span className="font-mono text-xs text-muted">{a.staffId}</span>
      </div>
    ) },
    { key: 'email', label: 'Email', render: (a) => <span className="break-all text-sm">{a.email}</span> },
    { key: 'role', label: 'Role', render: (a) => <Badge tone={ROLE_TONE[a.roleCode]}>{a.roleName}</Badge> },
    { key: 'status', label: 'Status', render: (a) => (
      <div className="flex flex-wrap gap-1">
        {a.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}
        {a.invitePending && <Badge tone="warning">Invitation pending</Badge>}
      </div>
    ) },
    { key: 'lastLoginAt', label: 'Last sign-in', render: (a) => <span className="text-sm">{formatDateTime(a.lastLoginAt)}</span> },
    { key: 'actions', label: '', render: (a) => (a.id === user.id ? null : (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={ShieldCheck} onClick={() => setDialog({ type: 'role', admin: a })}>Change role</Button>
        {a.status === 'active'
          ? <Button size="sm" variant="secondary" icon={UserX} onClick={() => setDialog({ type: 'deactivate', admin: a })}>Deactivate</Button>
          : <Button size="sm" variant="secondary" icon={UserCheck} onClick={() => setDialog({ type: 'reactivate', admin: a })}>Reactivate</Button>}
      </div>
    )) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Administrators" description="Staff who can use this console. New administrators get an email link to set their own password."
        actions={<Button icon={UserPlus} onClick={() => setDialog({ type: 'invite' })}>Invite administrator</Button>} />
      {flash && <Notice type="success" onClose={() => setFlash('')}>{flash}</Notice>}
      {error && <Notice type="error">{error}</Notice>}
      {!admins && !error && <Spinner label="Loading administrators…" />}
      {admins && <ResponsiveTable caption="Administrators" columns={columns} rows={admins} />}

      {roles.length > 0 && (
        <section aria-labelledby="roles-title" className="flex flex-col gap-3">
          <h2 id="roles-title" className="text-lg font-bold">What each role can do</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {roles.map((r) => (
              <Card key={r.code} className="flex flex-col gap-2 p-4">
                <h3 className="font-bold">{r.name}</h3>
                <p className="text-sm text-muted">{r.description}</p>
                <ul className="flex flex-wrap gap-1">{r.permissions.map((p) => <li key={p}><Badge>{p}</Badge></li>)}</ul>
              </Card>
            ))}
          </div>
        </section>
      )}

      <InviteDialog open={dialog?.type === 'invite'} roles={roles} onClose={() => setDialog(null)} onDone={done} />
      <RoleDialog admin={dialog?.type === 'role' ? dialog.admin : null} roles={roles} onClose={() => setDialog(null)} onDone={done} />
      <StatusDialog admin={dialog?.type === 'deactivate' || dialog?.type === 'reactivate' ? dialog.admin : null}
        mode={dialog?.type} onClose={() => setDialog(null)} onDone={done} />
    </div>
  );
}

function InviteDialog({ open, roles, onClose, onDone }) {
  const blank = { fullName: '', staffId: '', email: '', roleCode: 'officer', currentPassword: '' };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    try {
      const d = await api.post('/api/admin/admins', form);
      setForm(blank); onDone(d.message);
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} title="Invite an administrator" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
        <FormField id="fullName" label="Full name" required error={errors.fullName}>
          {(p) => <input {...p} value={form.fullName} onChange={set('fullName')} autoComplete="off" />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="staffId" label="Staff ID" required error={errors.staffId} hint="They sign in with this.">
            {(p) => <input {...p} value={form.staffId} onChange={set('staffId')} className={`${p.className} font-mono`} autoComplete="off" />}
          </FormField>
          <FormField id="roleCode" label="Role" required error={errors.roleCode}>
            {(p) => <select {...p} value={form.roleCode} onChange={set('roleCode')}>{roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select>}
          </FormField>
        </div>
        <FormField id="email" label="Work email" required error={errors.email} hint="The set-password link is sent here.">
          {(p) => <input {...p} type="email" value={form.email} onChange={set('email')} autoComplete="off" />}
        </FormField>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-password" className="text-sm font-semibold">Your password<span aria-hidden="true" className="text-danger-700"> *</span></label>
          <PasswordInput id="invite-password" value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password"
            invalid={Boolean(errors.currentPassword)} aria-describedby={errors.currentPassword ? 'currentPassword-error' : undefined} />
          {errors.currentPassword && <p id="currentPassword-error" className="text-sm font-medium text-danger-700">{errors.currentPassword}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy} icon={UserPlus}>{busy ? 'Sending…' : 'Send invitation'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function RoleDialog({ admin, roles, onClose, onDone }) {
  const [roleCode, setRoleCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (admin) { setRoleCode(admin.roleCode); setError(''); } }, [admin]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { onDone((await api.patch(`/api/admin/admins/${admin.id}`, { roleCode })).message); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={Boolean(admin)} title={`Change ${admin?.fullName}’s role`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Role</legend>
          {roles.map((r) => (
            <label key={r.code} className="flex cursor-pointer gap-3 rounded-control border border-line p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="role" value={r.code} checked={roleCode === r.code} onChange={() => setRoleCode(r.code)} className="mt-1 size-4 accent-brand-600" />
              <span className="flex flex-col"><span className="font-semibold">{r.name}</span><span className="text-sm text-muted">{r.description}</span></span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted">They’ll be signed out so the new permissions apply at their next sign-in.</p>
        {error && <Notice type="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || roleCode === admin?.roleCode}>{busy ? 'Saving…' : 'Change role'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function StatusDialog({ admin, mode, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const deactivate = mode === 'deactivate';
  const submit = async (e) => {
    e.preventDefault();
    if (deactivate && reason.trim().length < 5) { setError('Give a reason of at least 5 characters.'); return; }
    setBusy(true); setError('');
    try {
      const d = await api.post(`/api/admin/admins/${admin.id}/${mode}`, deactivate ? { reason } : {});
      setReason(''); onDone(d.message);
    } catch (err) { setError(err.fields?.reason || err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={Boolean(admin)} title={`${deactivate ? 'Deactivate' : 'Reactivate'} ${admin?.fullName}?`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {deactivate ? (
          <FormField id="admin-reason" label="Reason" required error={error} hint="They are signed out immediately. Recorded in the audit log.">
            {(p) => <textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </FormField>
        ) : error && <Notice type="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={deactivate ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Saving…' : deactivate ? 'Deactivate' : 'Reactivate'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
