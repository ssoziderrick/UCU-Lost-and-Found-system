// Student registry: who may activate an account. CSV import with a dry-run preview (super admins),
// and office activation links for enrolled students with no university email.
import { useState } from 'react';
import { FileUp, Link2, Search, Upload, UserRoundSearch } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import { usePageTitle } from '../../components/ui';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Spinner } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { PasswordInput } from '../../design/forms';
import { CopyableLink, Dialog, Pagination, ResponsiveTable } from '../../design/data';
import useList from './useList';

const STATUS_TONE = { enrolled: 'success', withdrawn: 'danger', graduated: 'neutral' };

export default function Registry() {
  usePageTitle('Student registry');
  const { can } = useAuth();
  const [query, setQuery] = useState({ q: '', status: '', activated: '', page: 1 });
  const [search, setSearch] = useState('');
  const { data, error, reload } = useList('/api/admin/registry', query);
  const [linkFor, setLinkFor] = useState(null);

  const columns = [
    { key: 'name', label: 'Student', primary: true, render: (r) => (
      <div className="flex flex-col"><span className="font-semibold">{r.fullName}</span><span className="font-mono text-xs text-muted">{r.registrationNumber}</span></div>
    ) },
    { key: 'programme', label: 'Programme', render: (r) => r.programme || '—' },
    { key: 'universityEmail', label: 'University email', render: (r) => r.universityEmail
      ? <span className="break-all text-sm">{r.universityEmail}</span> : <Badge tone="warning">No email on file</Badge> },
    { key: 'status', label: 'Registry status', render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
    { key: 'account', label: 'Account', render: (r) => (r.userId
      ? <Badge tone={r.accountStatus === 'active' ? 'brand' : 'danger'}>{r.accountStatus === 'active' ? 'Activated' : 'Deactivated'}</Badge>
      : <span className="text-sm text-muted">Not activated</span>) },
    { key: 'actions', label: '', render: (r) => (!r.userId && r.status === 'enrolled'
      ? <Button size="sm" variant="secondary" icon={Link2} onClick={() => setLinkFor(r)}>Activation link</Button> : null) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Student registry"
        description="Only enrolled students in this list can activate an account. It comes from an authorised registrar export, not from UCU’s systems directly." />

      {can('registry.manage') && <ImportPanel onImported={reload} />}

      <form role="search" className="flex flex-col gap-3 lg:flex-row lg:items-end"
        onSubmit={(e) => { e.preventDefault(); setQuery((q) => ({ ...q, q: search, page: 1 })); }}>
        <FormField id="registry-search" label="Search" optionalLabel={false} className="flex-1">
          {(p) => <input {...p} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, registration number or email" />}
        </FormField>
        <FormField id="registry-status" label="Registry status" optionalLabel={false}>
          {(p) => (
            <select {...p} value={query.status} onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value, page: 1 }))}>
              <option value="">All</option><option value="enrolled">Enrolled</option><option value="withdrawn">Withdrawn</option><option value="graduated">Graduated</option>
            </select>
          )}
        </FormField>
        <FormField id="registry-activated" label="Account" optionalLabel={false}>
          {(p) => (
            <select {...p} value={query.activated} onChange={(e) => setQuery((q) => ({ ...q, activated: e.target.value, page: 1 }))}>
              <option value="">All</option><option value="yes">Activated</option><option value="no">Not activated</option>
            </select>
          )}
        </FormField>
        <Button type="submit" icon={Search}>Search</Button>
      </form>

      {error && <Notice type="error">{error}</Notice>}
      {!data && !error && <Spinner label="Loading the registry…" />}
      {data && (
        <>
          <ResponsiveTable caption="Student registry" rowKey="registrationNumber" columns={columns} rows={data.items}
            empty={<EmptyState icon={UserRoundSearch} title="No registry entries found">Try a different search, or import the registrar’s export.</EmptyState>} />
          <Pagination {...data} noun="students" onPage={(p) => setQuery((q) => ({ ...q, page: p }))} />
        </>
      )}

      <ActivationLinkDialog entry={linkFor} onClose={() => setLinkFor(null)} onIssued={reload} />
    </div>
  );
}

function ImportPanel({ onImported }) {
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0); // file inputs can only be cleared by remounting
  const [password, setPassword] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (dryRun) => {
    const errs = {};
    if (!file) errs.file = 'Choose a CSV file.';
    if (!password) errs.currentPassword = 'Enter your password to confirm.';
    setErrors(errs); setMessage('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('currentPassword', password);
      fd.append('file', file);
      const d = await api.post(`/api/admin/registry/import${dryRun ? '?dryRun=true' : ''}`, fd);
      if (dryRun) { setPreview(d); setResult(null); } else { setResult(d); setPreview(null); setFile(null); setFileKey((k) => k + 1); setPassword(''); onImported(); }
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  };

  const summary = preview || result;
  return (
    <Card as="section" aria-labelledby="import-title" className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><FileUp aria-hidden="true" className="size-5" /></span>
        <div className="flex flex-col gap-1">
          <h2 id="import-title" className="text-lg font-bold">Import from the registrar</h2>
          <p className="text-sm text-muted">
            CSV with the header <code className="rounded bg-mist px-1 font-mono text-xs">registration_number,full_name,university_email,programme,status</code>.
            Status is enrolled, withdrawn or graduated (blank means enrolled). Preview first: nothing is saved until you import.
          </p>
        </div>
      </div>
      {message && <Notice type="error">{message}</Notice>}
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="file" label="CSV file" required error={errors.file}>
          {(p) => <input {...p} key={fileKey} type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files[0] || null); setPreview(null); setResult(null); }}
            className={`${p.className} py-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-semibold file:text-brand-800`} />}
        </FormField>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="currentPassword" className="text-sm font-semibold">Your password<span aria-hidden="true" className="text-danger-700"> *</span></label>
          <PasswordInput id="currentPassword" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            invalid={Boolean(errors.currentPassword)} aria-describedby={errors.currentPassword ? 'currentPassword-error' : 'currentPassword-hint'} />
          <p id="currentPassword-hint" className="text-sm text-muted">Required for sensitive changes.</p>
          {errors.currentPassword && <p id="currentPassword-error" className="text-sm font-medium text-danger-700">{errors.currentPassword}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => send(true)} disabled={busy} icon={Search}>{busy && !preview ? 'Checking…' : 'Preview import'}</Button>
        {preview && preview.added + preview.updated > 0 && (
          <Button onClick={() => send(false)} disabled={busy} icon={Upload}>{busy ? 'Importing…' : `Import ${preview.added + preview.updated} row(s)`}</Button>
        )}
      </div>

      {summary && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <Notice type={result ? 'success' : 'info'}>{summary.message}</Notice>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['New', summary.added], ['Changed', summary.updated], ['Unchanged', summary.unchanged], ['Problems', summary.rejectedCount]].map(([k, v]) => (
              <div key={k} className="rounded-control bg-mist p-3"><dt className="text-sm text-muted">{k}</dt><dd className="font-display text-xl font-bold tabular-nums">{v}</dd></div>
            ))}
          </dl>
          {summary.rejected.length > 0 && (
            <ResponsiveTable caption="Rows with problems" rowKey="line" rows={summary.rejected} columns={[
              { key: 'line', label: 'Line', primary: true, render: (r) => `Line ${r.line}` },
              { key: 'registrationNumber', label: 'Registration no.', render: (r) => <span className="font-mono text-xs">{r.registrationNumber || '—'}</span> },
              { key: 'errors', label: 'Problem', render: (r) => <ul className="list-disc pl-4 text-sm">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul> },
            ]} />
          )}
          {summary.rejectedCount > summary.rejected.length && <p className="text-sm text-muted">Showing the first {summary.rejected.length} problems.</p>}
        </div>
      )}
    </Card>
  );
}

function ActivationLinkDialog({ entry, onClose, onIssued }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const issue = async () => {
    setBusy(true); setError('');
    try {
      setResult(await api.post(`/api/admin/registry/${encodeURIComponent(entry.registrationNumber)}/activation-link`));
      onIssued();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const done = () => { setResult(null); setError(''); onClose(); };
  return (
    <Dialog open={Boolean(entry)} title={`Activation link for ${entry?.fullName}`} onClose={done}>
      {!result ? (
        <>
          <Notice type="warning" title="Check their student ID first">
            Issue this only to the student in person, after checking their ID matches <span className="font-mono">{entry?.registrationNumber}</span>.
          </Notice>
          {error && <Notice type="error">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={done}>Cancel</Button>
            <Button onClick={issue} disabled={busy} icon={Link2}>{busy ? 'Issuing…' : 'I’ve checked their ID, issue link'}</Button>
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
