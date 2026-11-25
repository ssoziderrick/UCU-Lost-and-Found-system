// Item categories with one level of groups: add, rename, move between groups, hide / show.
import { useEffect, useMemo, useState } from 'react';
import { FolderTree, Pencil, Plus, Power } from 'lucide-react';
import { api } from '../../api';
import { invalidateMeta } from '../../useMeta';
import { usePageTitle } from '../../components/ui';
import { Badge, Button, Card, Notice, PageHeader, Spinner } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { ErrorSummary } from '../../design/forms';
import { Dialog, ResponsiveTable } from '../../design/data';

export default function Categories() {
  usePageTitle('Categories');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [editing, setEditing] = useState(null);

  const load = () => api.get('/api/admin/categories').then((d) => setItems(d.items)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const done = (msg) => { setFlash(msg); setEditing(null); invalidateMeta(); load(); };
  const toggle = async (c) => {
    try { done((await api.patch(`/api/admin/categories/${c.id}`, { isActive: !c.isActive })).message); } catch (e) { setError(e.message); }
  };

  const { groups, loose } = useMemo(() => {
    if (!items) return { groups: [], loose: [] };
    const gs = items.filter((c) => !c.parentId && Number(c.children) > 0);
    return {
      groups: gs.map((g) => ({ ...g, members: items.filter((c) => c.parentId === g.id) })),
      loose: items.filter((c) => !c.parentId && Number(c.children) === 0),
    };
  }, [items]);
  // Possible groups: any top-level category without reports (it can take children).
  const groupOptions = items ? items.filter((c) => !c.parentId && Number(c.reports) === 0) : [];

  const columns = [
    { key: 'name', label: 'Category', primary: true, render: (c) => <span className="font-semibold">{c.name}</span> },
    { key: 'reports', label: 'Reports', className: 'tabular-nums', render: (c) => c.reports },
    { key: 'status', label: 'Status', render: (c) => (c.isActive ? <Badge tone="success">Shown</Badge> : <Badge tone="neutral">Hidden</Badge>) },
    { key: 'actions', label: '', render: (c) => (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(c)}>Edit<span className="sr-only"> {c.name}</span></Button>
        <Button size="sm" variant="secondary" icon={Power} onClick={() => toggle(c)}>{c.isActive ? 'Hide' : 'Show'}<span className="sr-only"> {c.name}</span></Button>
      </div>
    ) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Categories" description="What students choose when they describe an item. Groups keep the list short and help matching treat related items as close."
        actions={<Button icon={Plus} onClick={() => setEditing({})}>Add category</Button>} />
      {flash && <Notice type="success" onClose={() => setFlash('')}>{flash}</Notice>}
      {error && <Notice type="error" onClose={() => setError('')}>{error}</Notice>}
      {!items && !error && <Spinner label="Loading categories…" />}
      {groups.map((g) => (
        <Card as="section" key={g.id} aria-labelledby={`group-${g.id}`} className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`group-${g.id}`} className="flex items-center gap-2 text-base font-bold"><FolderTree aria-hidden="true" className="size-4 text-brand-700" />{g.name}
              {!g.isActive && <Badge tone="neutral">Hidden</Badge>}</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(g)}>Rename group</Button>
              <Button size="sm" variant="ghost" icon={Power} onClick={() => toggle(g)}>{g.isActive ? 'Hide group' : 'Show group'}</Button>
            </div>
          </div>
          <ResponsiveTable caption={g.name} columns={columns} rows={g.members} />
        </Card>
      ))}
      {loose.length > 0 && (
        <Card as="section" aria-labelledby="loose" className="flex flex-col gap-3 p-4">
          <h2 id="loose" className="text-base font-bold">Not in a group</h2>
          <ResponsiveTable caption="Categories not in a group" columns={columns} rows={loose} />
        </Card>
      )}
      <CategoryDialog category={editing} groupOptions={groupOptions} onClose={() => setEditing(null)} onDone={done} />
    </div>
  );
}

function CategoryDialog({ category, groupOptions, onClose, onDone }) {
  const isNew = category && !category.id;
  const isGroup = Number(category?.children) > 0;
  const [form, setForm] = useState({ name: '', parentId: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!category) return;
    setErrors({}); setMessage('');
    setForm({ name: category.name || '', parentId: category.parentId ? String(category.parentId) : '' });
  }, [category]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    const body = isGroup ? { name: form.name } : { name: form.name, parentId: form.parentId ? Number(form.parentId) : null };
    try {
      const d = isNew ? await api.post('/api/admin/categories', body) : await api.patch(`/api/admin/categories/${category.id}`, body);
      onDone(d.message);
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  };
  const options = groupOptions.filter((g) => g.id !== category?.id);
  return (
    <Dialog open={Boolean(category)} title={isNew ? 'Add a category' : `Edit ${category?.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
        <FormField id="cat-name" label="Name" required error={errors.name}>
          {(p) => <input {...p} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={60} />}
        </FormField>
        {!isGroup && (
          <FormField id="cat-parent" label="Group" error={errors.parentId}
            hint="Choose a group, or none. Putting a category under another one turns that one into a group (only if it has no reports).">
            {(p) => (
              <select {...p} value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
                <option value="">No group</option>
                {options.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
          </FormField>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add category' : 'Save changes'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
