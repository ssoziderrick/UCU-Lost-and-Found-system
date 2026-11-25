// Student accounts: search, deactivate / reactivate, and office-issued reset links.
import { useState } from 'react';
import { KeyRound, Search, UserCheck, UserX, Users } from 'lucide-react';
import { api } from '../../api';
import { usePageTitle } from '../../components/ui';
import { Badge, Button, EmptyState, Notice, PageHeader, Spinner } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { CopyableLink, Dialog, Pagination, ResponsiveTable, formatDateTime } from '../../design/data';
import useList from './useList';

export default function Students() {
  usePageTitle('Students');
  const [query, setQuery] = useState({ q: '', status: '', page: 1 });
  const [search, setSearch] = useState('');
  const { data, error, reload } = useList('/api/admin/students', query);
  const [dialog, setDialog] = useState(null); // { type, student }
  const [flash, setFlash] = useState('');

  const close = () => setDialog(null);
  const afterAction = (msg) => { setFlash(msg); close(); reload(); };

  const columns = [
    { key: 'name', label: 'Student', primary: true, render: (s) => (
      <div className="flex flex-col"><span className="font-semibold">{s.fullName}</span><span className="font-mono text-xs text-muted">{s.registrationNumber || 'No registration number'}</span></div>
    ) },
    { key: 'programme', label: 'Registry', render: (s) => (
      <div className="flex flex-col gap-1">
        <span className="text-sm">{s.programme || '—'}</span>
        {s.registryStatus && s.registryStatus !== 'enrolled' && <Badge tone="warning">Registry: {s.registryStatus}</Badge>}
      </div>
    ) },
    { key: 'status', label: 'Account', render: (s) => (
      <div className="flex flex-wrap gap-1">
        {s.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}
        {s.locked && <Badge tone="warning">Locked for 15 min</Badge>}
      </div>
    ) },
    { key: 'activity', label: 'Activity', render: (s) => <span className="text-sm text-muted">{s.reports} reports · {s.claims} claims</span> },
    { key: 'lastLoginAt', label: 'Last sign-in', render: (s) => <span className="text-sm">{formatDateTime(s.lastLoginAt)}</span> },
    { key: 'actions', label: '', render: (s) => (
      <div className="flex flex-wrap gap-2">
        {s.status === 'active' ? (
          <>
            <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => setDialog({ type: 'link', student: s })}>Reset link</Button>
            <Button size="sm" variant="secondary" icon={UserX} onClick={() => setDialog({ type: 'deactivate', student: s })}>Deactivate</Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" icon={UserCheck} onClick={() => setDialog({ type: 'reactivate', student: s })}>Reactivate</Button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Students" description="Accounts activated from the student registry. Deactivating an account signs the student out immediately." />
      {flash && <Notice type="success" onClose={() => setFlash('')}>{flash}</Notice>}

      <form role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => { e.preventDefault(); setQuery((q) => ({ ...q, q: search, page: 1 })); }}>
        <FormField id="student-search" label="Search" optionalLabel={false} className="flex-1">
          {(p) => <input {...p} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, registration number or email" />}
        </FormField>
        <FormField id="student-status" label="Account status" optionalLabel={false}>
          {(p) => (
            <select {...p} value={query.status} onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value, page: 1 }))}>
              <option value="">All</option><option value="active">Active</option><option value="deactivated">Deactivated</option>
            </select>
          )}
        </FormField>
        <Button type="submit" icon={Search}>Search</Button>
      </form>

      {error && <Notice type="error">{error}</Notice>}
      {!data && !error && <Spinner label="Loading students…" />}
      {data && (
        <>
          <ResponsiveTable caption="Student accounts" columns={columns} rows={data.items}
            empty={<EmptyState icon={Users} title="No students found">Try a different search, or clear the filters.</EmptyState>} />
          <Pagination {...data} noun="students" onPage={(p) => setQuery((q) => ({ ...q, page: p }))} />
        </>
      )}

      <DeactivateDialog student={dialog?.type === 'deactivate' ? dialog.student : null} onClose={close} onDone={afterAction} />
      <ReactivateDialog student={dialog?.type === 'reactivate' ? dialog.student : null} onClose={close} onDone={afterAction} />
      <ResetLinkDialog student={dialog?.type === 'link' ? dialog.student : null} onClose={close} />
    </div>
  );
}

function DeactivateDialog({ student, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 5) { setError('Give a reason of at least 5 characters. It is recorded in the audit log.'); return; }
    setBusy(true); setError('');
    try {
      const d = await api.post(`/api/admin/students/${student.id}/deactivate`, { reason });
      setReason(''); onDone(d.message);
    } catch (err) { setError(err.fields?.reason || err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={Boolean(student)} title={`Deactivate ${student?.fullName}?`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-muted">They’ll be signed out everywhere and won’t be able to sign in until an officer reactivates the account. Their reports and claims stay.</p>
        <FormField id="deactivate-reason" label="Reason" required error={error} hint="Recorded in the audit log.">
          {(p) => <textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={busy}>{busy ? 'Deactivating…' : 'Deactivate account'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ReactivateDialog({ student, onClose, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setError('');
    try { onDone((await api.post(`/api/admin/students/${student.id}/reactivate`)).message); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={Boolean(student)} title={`Reactivate ${student?.fullName}?`} onClose={onClose}>
      {student?.statusReason && <p className="text-muted">Deactivated because: {student.statusReason}</p>}
      {error && <Notice type="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={go} disabled={busy}>{busy ? 'Reactivating…' : 'Reactivate account'}</Button>
      </div>
    </Dialog>
  );
}

function ResetLinkDialog({ student, onClose }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const issue = async () => {
    setBusy(true); setError('');
    try { setResult(await api.post(`/api/admin/students/${student.id}/reset-link`)); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const done = () => { setResult(null); setError(''); onClose(); };
  return (
    <Dialog open={Boolean(student)} title={`Reset link for ${student?.fullName}`} onClose={done}>
      {!result ? (
        <>
          <Notice type="warning" title="Check their student ID first">
            Only issue a link to the student in person, after checking that the photo and registration number <span className="font-mono">{student?.registrationNumber}</span> match.
          </Notice>
          {error && <Notice type="error">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={done}>Cancel</Button>
            <Button onClick={issue} disabled={busy} icon={KeyRound}>{busy ? 'Issuing…' : 'I’ve checked their ID, issue link'}</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted">{result.message} It expires in {result.expiresInHours} hours.</p>
          <CopyableLink link={result.link} />
          <div className="flex justify-end"><Button onClick={done}>Done</Button></div>
        </>
      )}
    </Dialog>
  );
}
