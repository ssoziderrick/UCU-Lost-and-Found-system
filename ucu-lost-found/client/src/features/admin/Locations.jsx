// Campus locations grouped by zone: add, edit, reorder, deactivate / reactivate. Nothing is deleted.
import { useEffect, useState } from 'react';
import { MapPinned, Pencil, Plus, Power } from 'lucide-react';
import { api } from '../../api';
import { invalidateMeta } from '../../useMeta';
import { usePageTitle } from '../../components/ui';
import { Badge, Button, Card, Notice, PageHeader, Spinner } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { ErrorSummary } from '../../design/forms';
import { Dialog, ResponsiveTable } from '../../design/data';

const KINDS = [
  ['library', 'Library or archive'], ['lecture', 'Lecture room or block'], ['lab', 'Laboratory'], ['gate', 'Gate or entrance'],
  ['sports', 'Sports ground'], ['hall', 'Hall or hostel'], ['dining', 'Dining'], ['chapel', 'Chapel'], ['health', 'Health'],
  ['office', 'Office'], ['outdoor', 'Outdoor space'], ['other', 'Other'],
];
const kindLabel = Object.fromEntries(KINDS);

export default function Locations() {
  usePageTitle('Campus locations');
  const [items, setItems] = useState(null);
  const [zones, setZones] = useState([]);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [editing, setEditing] = useState(null); // {} for new, or a location
  const [zoneOpen, setZoneOpen] = useState(false);

  const load = () => Promise.all([api.get('/api/admin/locations'), api.get('/api/admin/zones')])
    .then(([l, z]) => { setItems(l.items); setZones(z.items); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const done = (msg) => { setFlash(msg); setEditing(null); setZoneOpen(false); invalidateMeta(); load(); };

  const toggle = async (loc) => {
    try { done((await api.patch(`/api/admin/locations/${loc.id}`, { isActive: !loc.isActive })).message); } catch (e) { setError(e.message); }
  };

  const columns = [
    { key: 'name', label: 'Location', primary: true, render: (l) => (
      <div className="flex flex-col"><span className="font-semibold">{l.name}</span>{l.description && <span className="text-xs text-muted">{l.description}</span>}</div>
    ) },
    { key: 'kind', label: 'Type', render: (l) => <span className="text-sm">{kindLabel[l.kind]}</span> },
    { key: 'reports', label: 'Reports', className: 'tabular-nums', render: (l) => l.reports },
    { key: 'status', label: 'Status', render: (l) => (l.isActive ? <Badge tone="success">Shown</Badge> : <Badge tone="neutral">Hidden</Badge>) },
    { key: 'actions', label: '', render: (l) => (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(l)}>Edit<span className="sr-only"> {l.name}</span></Button>
        <Button size="sm" variant="secondary" icon={Power} onClick={() => toggle(l)}>{l.isActive ? 'Hide' : 'Show'}<span className="sr-only"> {l.name}</span></Button>
      </div>
    ) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Campus locations"
        description="The places students choose from when they report an item. Hidden places stay on existing reports but can’t be picked for new ones. Check names against official university names before launch."
        actions={(
          <>
            <Button variant="secondary" icon={Plus} onClick={() => setZoneOpen(true)}>Add zone</Button>
            <Button icon={MapPinned} onClick={() => setEditing({})}>Add location</Button>
          </>
        )} />
      {flash && <Notice type="success" onClose={() => setFlash('')}>{flash}</Notice>}
      {error && <Notice type="error" onClose={() => setError('')}>{error}</Notice>}
      {!items && !error && <Spinner label="Loading locations…" />}
      {items && zones.map((z) => {
        const rows = items.filter((l) => l.zoneId === z.id);
        return (
          <Card as="section" key={z.id} aria-labelledby={`zone-${z.id}`} className="flex flex-col gap-3 p-4">
            <h2 id={`zone-${z.id}`} className="flex items-center gap-2 text-base font-bold">{z.name}<span className="text-sm font-normal text-muted">· {rows.length}</span></h2>
            {rows.length ? <ResponsiveTable caption={z.name} columns={columns} rows={rows} /> : <p className="text-sm text-muted">No locations in this zone yet.</p>}
          </Card>
        );
      })}
      <LocationDialog location={editing} zones={zones} onClose={() => setEditing(null)} onDone={done} />
      <ZoneDialog open={zoneOpen} onClose={() => setZoneOpen(false)} onDone={done} />
    </div>
  );
}

function LocationDialog({ location, zones, onClose, onDone }) {
  const isNew = location && !location.id;
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!location) return;
    setErrors({}); setMessage('');
    setForm({ name: location.name || '', zoneId: String(location.zoneId || ''), kind: location.kind || 'lecture', description: location.description || '', sortOrder: location.sortOrder ?? 0 });
  }, [location]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    const body = { ...form, zoneId: Number(form.zoneId) || undefined, sortOrder: Number(form.sortOrder) || 0 };
    try {
      const d = isNew ? await api.post('/api/admin/locations', body) : await api.patch(`/api/admin/locations/${location.id}`, body);
      onDone(d.message);
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={Boolean(location)} title={isNew ? 'Add a campus location' : `Edit ${location?.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
        <FormField id="loc-name" label="Name" required error={errors.name} hint="Use the official name students will recognise.">
          {(p) => <input {...p} value={form.name || ''} onChange={set('name')} maxLength={100} />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="loc-zone" label="Zone" required error={errors.zoneId}>
            {(p) => <select {...p} value={form.zoneId || ''} onChange={set('zoneId')}><option value="">Choose a zone</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>}
          </FormField>
          <FormField id="loc-kind" label="Type of place" required error={errors.kind}>
            {(p) => <select {...p} value={form.kind || ''} onChange={set('kind')}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
          </FormField>
        </div>
        <FormField id="loc-description" label="Description" error={errors.description} hint="Optional, e.g. “Opposite the main library”.">
          {(p) => <input {...p} value={form.description || ''} onChange={set('description')} maxLength={255} />}
        </FormField>
        <FormField id="loc-order" label="Position in its zone" error={errors.sortOrder} hint="Lower numbers come first; equal numbers sort alphabetically.">
          {(p) => <input {...p} type="number" min={0} max={9999} value={form.sortOrder ?? 0} onChange={set('sortOrder')} className={`${p.className} max-w-32`} />}
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add location' : 'Save changes'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ZoneDialog({ open, onClose, onDone }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { onDone((await api.post('/api/admin/zones', { name })).message); setName(''); } catch (err) { setError(err.fields?.name || err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} title="Add a zone" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField id="zone-name" label="Zone name" required error={error} hint="A part of campus, e.g. “Faculty of Health Sciences”. Nearby places in one zone help matching.">
          {(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add zone'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
