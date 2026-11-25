// Create or edit a lost / found report. New reports send text and photos together (with upload progress);
// when editing, photo changes are saved straight away and text changes on "Save changes".
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, Lock, PackageSearch, ShieldAlert } from 'lucide-react';
import { api } from '../../api';
import useMeta from '../../useMeta';
import { usePageTitle } from '../../components/ui';
import { Button, Card, Notice, PageHeader, Spinner, cx } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { ErrorSummary } from '../../design/forms';
import { validatePhotos, validateReport } from '../../validation';
import PhotoPicker, { withCover } from './PhotoPicker';

const today = () => new Date().toISOString().slice(0, 10);
const BLANK = { type: '', title: '', categoryId: '', description: '', identifyingDetails: '', eventDate: today(), locationId: '', locationDetail: '', custody: '', custodyNote: '' };
const CUSTODY = [
  ['lost_property_office', 'I’ve handed it to the lost-property office', 'Recommended. The office keeps it safe until a claim is approved.'],
  ['with_finder', 'I still have it', 'Hand it to the office soon. Don’t arrange a handover privately.'],
  ['other', 'Somewhere else', 'For example, left with a security guard. Say where below.'],
];

export default function ReportForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  usePageTitle(editing ? 'Edit report' : 'Report an item');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { categories, categoryGroups, locations, zones, metaError } = useMeta();
  const [form, setForm] = useState(() => ({ ...BLANK, type: ['lost', 'found'].includes(params.get('type')) ? params.get('type') : '' }));
  const [queued, setQueued] = useState([]); // new report: File objects waiting to upload
  const [saved, setSaved] = useState([]);   // editing: photos already on the server
  const [loading, setLoading] = useState(editing);
  const [blocked, setBlocked] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState('');
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!editing) return;
    api.get(`/api/reports/${id}`).then(({ report: r }) => {
      if (!r.canEdit) { setBlocked(r.isOwner ? 'This report can’t be edited any more because it is no longer open.' : 'You can only edit reports you created.'); return; }
      setForm({
        type: r.type, title: r.title, categoryId: String(r.categoryId), description: r.description,
        identifyingDetails: r.identifyingDetails || '', eventDate: r.eventDate, locationId: String(r.locationId),
        locationDetail: r.locationDetail || '', custody: r.custody || '', custodyNote: r.custodyNote || '',
      });
      setSaved(r.images.map((img) => ({ ...img, key: `s${img.id}` })));
    }).catch((e) => setBlocked(e.message)).finally(() => setLoading(false));
  }, [editing, id]);

  const grouped = useMemo(() => {
    const groups = categoryGroups.map((g) => ({ ...g, items: categories.filter((c) => c.parentId === g.id) })).filter((g) => g.items.length);
    return { groups, loose: categories.filter((c) => !c.parentId) };
  }, [categories, categoryGroups]);
  const byZone = useMemo(() => zones.map((z) => ({ ...z, items: locations.filter((l) => l.zoneId === z.id) })).filter((z) => z.items.length), [zones, locations]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const found = form.type === 'found';
  const items = editing ? saved : withCover(queued);

  // ---- photos: queued (new report) ---------------------------------------------------------------
  const queueAdd = (files) => {
    const problem = validatePhotos(files, queued.length);
    setErrors((e) => ({ ...e, photos: problem || undefined }));
    if (problem) return;
    setQueued((q) => [...q, ...files.map((file, n) => ({ key: `q${Date.now()}-${n}-${file.name}`, file, visibility: 'public' }))]);
  };
  const queueOps = {
    onAdd: queueAdd,
    onRemove: (item) => setQueued((q) => q.filter((x) => x.key !== item.key)),
    onVisibility: (item, visibility) => setQueued((q) => q.map((x) => (x.key === item.key ? { ...x, visibility } : x))),
    onCover: (item) => setQueued((q) => [q.find((x) => x.key === item.key), ...q.filter((x) => x.key !== item.key)]),
  };

  // ---- photos: saved (editing) — each change goes to the server immediately ---------------------
  const photoCall = async (fn, note) => {
    setPhotoBusy(true); setPhotoNote(''); setErrors((e) => ({ ...e, photos: undefined }));
    try {
      const d = await fn();
      setSaved(d.images.map((img) => ({ ...img, key: `s${img.id}` })));
      setPhotoNote(note || d.message);
    } catch (err) { setErrors((e) => ({ ...e, photos: err.fields?.photos || err.message })); } finally { setPhotoBusy(false); setProgress(null); }
  };
  const savedOps = {
    onAdd: (files) => {
      const problem = validatePhotos(files, saved.length);
      if (problem) { setErrors((e) => ({ ...e, photos: problem })); return; }
      const fd = new FormData();
      files.forEach((f) => { fd.append('photoVisibility', 'public'); fd.append('photos', f); });
      setProgress(0);
      photoCall(() => api.upload('POST', `/api/reports/${id}/images`, fd, setProgress));
    },
    onRemove: (item) => photoCall(() => api.delete(`/api/reports/${id}/images/${item.id}`)),
    onVisibility: (item, visibility) => photoCall(() => api.patch(`/api/reports/${id}/images/${item.id}`, { visibility })),
    onCover: (item) => photoCall(() => api.patch(`/api/reports/${id}/images/${item.id}`, { isCover: true }), 'Cover photo changed.'),
  };

  // ---- submit -------------------------------------------------------------------------------------
  const submit = async (e) => {
    e.preventDefault();
    const errs = validateReport({ ...form, photos: editing ? [] : queued.map((q) => q.file) });
    setErrors(errs); setMessage('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (editing) {
        const d = await api.put(`/api/reports/${id}`, form);
        navigate(`/reports/${id}`, { state: { flash: d.message } });
      } else {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
        queued.forEach((q) => { fd.append('photoVisibility', q.visibility); fd.append('photos', q.file); });
        setProgress(queued.length ? 0 : null);
        const d = await api.upload('POST', '/api/reports', fd, queued.length ? setProgress : undefined);
        navigate(`/reports/${d.id}`, { state: { flash: `${d.message} Reference ${d.refCode}.` } });
      }
    } catch (err) {
      setErrors(err.fields || {}); setMessage(err.message); setProgress(null);
    } finally { setBusy(false); }
  };

  if (loading) return <Page><Spinner label="Loading your report…" /></Page>;
  if (blocked) return <Page><Notice type="error">{blocked}</Notice><Link to="/my/reports" className="font-semibold text-brand-700">Back to my reports</Link></Page>;

  return (
    <Page>
      <PageHeader title={editing ? 'Edit report' : 'Report an item'}
        description={editing ? 'Changes to the text are saved when you press “Save changes”.' : 'It takes about two minutes. Everything except the private section is visible to everyone.'} />
      {metaError && <Notice type="error">{metaError}</Notice>}

      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <ErrorSummary errors={Object.keys(errors).filter((k) => errors[k]).length ? Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) : null} message={message} />

        {!editing && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">What happened?<span aria-hidden="true" className="text-danger-700"> *</span></legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {[['lost', 'I lost something', 'Others can tell you if they found it.', PackageSearch], ['found', 'I found something', 'Help it get back to its owner.', Camera]].map(([value, label, sub, Icon]) => (
                <label key={value} className={cx('flex cursor-pointer gap-3 rounded-card border bg-white p-4 transition-colors',
                  form.type === value ? 'border-brand-600 ring-2 ring-brand-200' : 'border-line hover:border-line-strong')}>
                  <input type="radio" name="type" id={value === 'lost' ? 'type' : undefined} value={value} checked={form.type === value}
                    onChange={set('type')} className="mt-1 size-4 accent-brand-600" aria-describedby={errors.type ? 'type-error' : undefined} />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2 font-semibold"><Icon aria-hidden="true" className="size-4 text-brand-700" />{label}</span>
                    <span className="text-sm text-muted">{sub}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.type && <p id="type-error" className="text-sm font-medium text-danger-700">{errors.type}</p>}
          </fieldset>
        )}

        <Card className="flex flex-col gap-5 p-5">
          <h2 className="text-lg font-bold">The item</h2>
          <FormField id="title" label="What is it?" required error={errors.title} hint="A short name, e.g. “Casio calculator” or “Black backpack”.">
            {(p) => <input {...p} value={form.title} onChange={set('title')} maxLength={120} />}
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="categoryId" label="Category" required error={errors.categoryId}>
              {(p) => (
                <select {...p} value={form.categoryId} onChange={set('categoryId')}>
                  <option value="">Choose a category</option>
                  {grouped.loose.filter((c) => c.name !== 'Other').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  {grouped.groups.map((g) => (
                    <optgroup key={g.id} label={g.name}>{g.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                  ))}
                  {grouped.loose.filter((c) => c.name === 'Other').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </FormField>
            <FormField id="eventDate" label={found ? 'Date found' : 'Date lost'} required error={errors.eventDate}>
              {(p) => <input {...p} type="date" max={today()} value={form.eventDate} onChange={set('eventDate')} />}
            </FormField>
          </div>
          <FormField id="description" label="Public description" required error={errors.description}
            hint="Colour, brand, size, what was with it. Anyone can read this.">
            {(p) => <textarea {...p} rows={4} maxLength={1000} value={form.description} onChange={set('description')} />}
          </FormField>
          <Notice type="warning" title="Keep proof of ownership out of the public description and photos">
            <span className="text-sm">Don’t include names, ID or registration numbers, serial numbers, phone lock screens or inscriptions. {found ? 'Put them in the private section below, so only the real owner can describe them in a claim.' : 'You’ll describe them privately if you claim a found item.'}</span>
          </Notice>
        </Card>

        <Card className="flex flex-col gap-5 p-5">
          <h2 className="text-lg font-bold">{found ? 'Where you found it' : 'Where you last had it'}</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="locationId" label="Campus location" required error={errors.locationId}
              hint="Can’t find the place? Choose “Other / Not listed” and describe it.">
              {(p) => (
                <select {...p} value={form.locationId} onChange={set('locationId')}>
                  <option value="">Choose a location</option>
                  {byZone.map((z) => (
                    <optgroup key={z.id} label={z.name}>{z.items.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                  ))}
                </select>
              )}
            </FormField>
            <FormField id="locationDetail" label="Where exactly?" error={errors.locationDetail} hint="e.g. “Second floor, by the windows”.">
              {(p) => <input {...p} value={form.locationDetail} onChange={set('locationDetail')} maxLength={150} />}
            </FormField>
          </div>
        </Card>

        {found && (
          <section aria-labelledby="private-title" className="flex flex-col gap-5 rounded-card border-2 border-dashed border-ink/25 bg-white p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white"><Lock aria-hidden="true" className="size-5" /></span>
              <div>
                <h2 id="private-title" className="text-lg font-bold">Private: only you and the lost-property office</h2>
                <p className="text-sm text-muted">Never shown on the listing. The office compares claims against it.</p>
              </div>
            </div>
            <FormField id="identifyingDetails" label="Details only the owner would know" error={errors.identifyingDetails}
              hint="An inscription, a name inside, a scratch, what’s on the lock screen, what’s in the pockets.">
              {(p) => <textarea {...p} rows={3} maxLength={1000} value={form.identifyingDetails} onChange={set('identifyingDetails')} />}
            </FormField>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Where is the item now?</legend>
              {CUSTODY.map(([value, label, sub]) => (
                <label key={value} className="flex cursor-pointer gap-3 rounded-control border border-line p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                  <input type="radio" name="custody" value={value} checked={form.custody === value} onChange={set('custody')} className="mt-1 size-4 accent-brand-600" />
                  <span className="flex flex-col"><span className="font-medium">{label}</span><span className="text-sm text-muted">{sub}</span></span>
                </label>
              ))}
            </fieldset>
            <FormField id="custodyNote" label="Note for the office" error={errors.custodyNote} hint="e.g. “Handed to the desk at 2pm” or “With the guard at Main Gate”.">
              {(p) => <input {...p} value={form.custodyNote} onChange={set('custodyNote')} maxLength={255} />}
            </FormField>
          </section>
        )}

        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-700" />
            <div>
              <h2 className="text-lg font-bold">Photos <span className="text-sm font-normal text-muted">(optional)</span></h2>
              <p className="text-sm text-muted">
                A clear photo helps the owner recognise it. Photos marked <strong>private</strong> are seen only by you and the office: use that for a close-up of an inscription or serial number.
                {editing && ' Photo changes are saved straight away.'}
              </p>
            </div>
          </div>
          {photoNote && <Notice type="success" onClose={() => setPhotoNote('')}>{photoNote}</Notice>}
          <PhotoPicker items={items} {...(editing ? savedOps : queueOps)} busy={busy || photoBusy} error={errors.photos} progress={progress} />
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="lg" disabled={busy}>{busy ? (editing ? 'Saving…' : 'Publishing…') : editing ? 'Save changes' : 'Publish report'}</Button>
          <Button variant="secondary" size="lg" to={editing ? `/reports/${id}` : '/dashboard'}>Cancel</Button>
        </div>
      </form>
    </Page>
  );
}

function Page({ children }) {
  return <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-8">{children}</div>;
}
