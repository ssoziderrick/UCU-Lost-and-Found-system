import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import useMeta from '../useMeta';
import { validateReport } from '../validation';
import { Alert, ErrorSummary, Field, Loading, usePageTitle } from '../components/ui';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { type: '', title: '', categoryId: '', description: '', privateDetails: '', eventDate: today(), locationId: '', locationDetail: '' };

export default function ReportForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  usePageTitle(editing ? 'Edit report' : 'Report an item');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { categories, locations, metaError } = useMeta();
  const [form, setForm] = useState({ ...EMPTY, type: ['lost', 'found'].includes(params.get('type')) ? params.get('type') : '' });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [hasExistingPhoto, setHasExistingPhoto] = useState(false);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);

  useEffect(() => {
    if (!editing) return;
    api.get(`/api/reports/${id}`).then(({ report: r }) => {
      if (!r.isOwner) { setMessage('You can only edit reports that you created.'); return; }
      if (r.status !== 'open') { setMessage('This report can no longer be edited because it is not open.'); return; }
      setForm({ type: r.type, title: r.title, categoryId: String(r.categoryId), description: r.description,
        privateDetails: r.privateDetails || '', eventDate: r.eventDate, locationId: String(r.locationId), locationDetail: r.locationDetail || '' });
      setHasExistingPhoto(r.hasPhoto);
    }).catch((e) => setMessage(e.message)).finally(() => setLoading(false));
  }, [editing, id]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pickPhoto = (e) => {
    const file = e.target.files?.[0] || null;
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : '');
    if (file) setRemovePhoto(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateReport({ ...form, photo });
    setErrors(errs); setMessage('');
    if (Object.keys(errs).length) return;
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (photo) fd.append('photo', photo);
    if (removePhoto) fd.append('removePhoto', 'true');
    setBusy(true);
    try {
      const d = editing ? await api.put(`/api/reports/${id}`, fd) : await api.post('/api/reports', fd);
      navigate(`/reports/${d.id}`, { state: { flash: d.message } });
    } catch (err) {
      setErrors(err.fields || {}); setMessage(err.message);
    } finally { setBusy(false); }
  };

  if (loading) return <Loading label="Loading report…" />;
  if (editing && message && !form.type) return <><Alert type="error">{message}</Alert><Link to="/my/reports">← My reports</Link></>;
  const isFound = form.type === 'found';

  return (
    <div className="form-page card">
      <h1>{editing ? 'Edit your report' : 'Report a lost or found item'}</h1>
      <Alert type="error">{metaError}</Alert>
      <form onSubmit={submit} noValidate>
        {Object.keys(errors).length ? <ErrorSummary errors={errors} message={message || undefined} /> : <Alert type="error">{message}</Alert>}

        <fieldset className={`field${errors.type ? ' has-error' : ''}`} aria-describedby={errors.type ? 'type-error' : undefined}>
          <legend>Did you lose or find this item? <span className="req" aria-hidden="true">*</span></legend>
          <div className="choice-cards">
            <label className="choice"><input id="type" type="radio" name="type" value="lost" checked={form.type === 'lost'} onChange={set('type')} disabled={editing} />
              <span><strong>I lost it</strong><small>Let finders know what you're looking for.</small></span></label>
            <label className="choice"><input type="radio" name="type" value="found" checked={form.type === 'found'} onChange={set('type')} disabled={editing} />
              <span><strong>I found it</strong><small>Hand it to the Lost &amp; Found office after reporting.</small></span></label>
          </div>
          {errors.type && <p className="field-error" id="type-error">⚠ {errors.type}</p>}
        </fieldset>

        <Field id="title" label="Item title" required error={errors.title} hint='Short and general, e.g. "Set of keys with blue keyring".'>
          {(p) => <input {...p} maxLength={120} value={form.title} onChange={set('title')} />}
        </Field>
        <div className="field-row">
          <Field id="categoryId" label="Category" required error={errors.categoryId}>
            {(p) => (
              <select {...p} value={form.categoryId} onChange={set('categoryId')}>
                <option value="">Choose a category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Field id="eventDate" label={isFound ? 'Date found' : 'Date lost'} required error={errors.eventDate}>
            {(p) => <input {...p} type="date" max={today()} value={form.eventDate} onChange={set('eventDate')} />}
          </Field>
        </div>
        <div className="field-row">
          <Field id="locationId" label="Campus location" required error={errors.locationId}>
            {(p) => (
              <select {...p} value={form.locationId} onChange={set('locationId')}>
                <option value="">Choose a location…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
          </Field>
          <Field id="locationDetail" label="Where exactly?" error={errors.locationDetail} hint='e.g. "Back row, under a chair".'>
            {(p) => <input {...p} maxLength={150} value={form.locationDetail} onChange={set('locationDetail')} />}
          </Field>
        </div>
        <Field id="description" label="Public description" required error={errors.description}
          hint={isFound
            ? 'Everyone can read this. Describe the item generally — do NOT include inscriptions, serial numbers, contents or other marks only the owner would know.'
            : 'Everyone can read this. Describe the item and where you last had it. Do not include your phone number.'}>
          {(p) => <textarea {...p} rows={4} maxLength={1000} value={form.description} onChange={set('description')} />}
        </Field>

        {isFound && (
          <div className="private-box">
            <Field id="privateDetails" label="🔒 Private identifying details" error={errors.privateDetails}
              hint="Visible ONLY to you and the administrator. Record hidden marks (e.g. an inscription on the back, contents, lock-screen image) so the office can test ownership claims. Keep these out of the public description and photo.">
              {(p) => <textarea {...p} rows={3} maxLength={1000} value={form.privateDetails} onChange={set('privateDetails')} />}
            </Field>
          </div>
        )}

        <Field id="photo" label="Photo" error={errors.photo}
          hint={`JPG, PNG or WebP, up to 2 MB.${isFound ? ' Make sure identifying marks are not visible in the photo.' : ''}`}>
          {(p) => <input {...p} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} />}
        </Field>
        {preview && <img className="preview" src={preview} alt="Preview of the selected photo" />}
        {editing && hasExistingPhoto && !photo && (
          <label className="checkbox"><input type="checkbox" checked={removePhoto} onChange={(e) => setRemovePhoto(e.target.checked)} /> Remove the current photo</label>
        )}

        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Publish report'}</button>
          <Link className="btn btn-ghost" to={editing ? `/reports/${id}` : '/'}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}
