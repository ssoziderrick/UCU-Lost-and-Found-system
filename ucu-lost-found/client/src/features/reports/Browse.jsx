// Browse and search: keyword or reference code, lost/found, category (or group), zone or location,
// dates, status and order. Filters live in the URL so results can be shared and survive a reload.
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Camera, PackageSearch, Search, SlidersHorizontal, X } from 'lucide-react';
import { api, qs } from '../../api';
import { useAuth } from '../../AuthContext';
import useMeta from '../../useMeta';
import { usePageTitle } from '../../components/ui';
import { Button, Card, EmptyState, Notice, PageHeader, Spinner, cx } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { Pagination } from '../../design/data';
import ItemCard from '../../design/ItemCard';

const KEYS = ['q', 'type', 'categoryId', 'zoneId', 'locationId', 'dateFrom', 'dateTo', 'status', 'sort'];
const ADVANCED = ['categoryId', 'zoneId', 'locationId', 'dateFrom', 'dateTo', 'status', 'sort'];

export default function Browse() {
  usePageTitle('Browse lost and found items');
  const { isAdmin } = useAuth();
  const location = useLocation();
  const { categories, categoryGroups, locations, zones } = useMeta();
  const [params, setParams] = useSearchParams();
  const fromUrl = () => Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const [form, setForm] = useState(fromUrl);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [filtersOpen, setFiltersOpen] = useState(() => ADVANCED.some((k) => params.get(k)));
  const page = Number(params.get('page')) || 1;
  const key = params.toString();

  useEffect(() => { setForm(fromUrl()); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    setData(null); setError('');
    api.get(`/api/reports${qs({ ...Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ''])), page })}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoneLocations = useMemo(() => (form.zoneId ? locations.filter((l) => String(l.zoneId) === form.zoneId) : locations), [form.zoneId, locations]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value, ...(k === 'zoneId' ? { locationId: '' } : {}) }));
  const apply = (next) => {
    if (next.dateFrom && next.dateTo && next.dateFrom > next.dateTo) { setError('The “from” date must be on or before the “to” date.'); return; }
    setParams(new URLSearchParams(qs(next)));
  };
  const submit = (e) => { e.preventDefault(); apply(form); };
  const setType = (type) => { const next = { ...form, type }; setForm(next); apply(next); };
  const clear = () => setParams({});
  const active = KEYS.filter((k) => k !== 'sort' && params.get(k)).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-8">
      {flash && <Notice type="success" onClose={() => setFlash('')}>{flash}</Notice>}
      <PageHeader title="Lost and found on campus"
        description="Every report in one place. Ownership is checked privately by the lost-property office before anything is handed over."
        actions={!isAdmin && (
          <>
            <Button to="/reports/new?type=found" variant="secondary" icon={Camera}>I found something</Button>
            <Button to="/reports/new?type=lost" icon={PackageSearch}>I lost something</Button>
          </>
        )} />

      <Card as="form" role="search" onSubmit={submit} className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <FormField id="q" label="Search" optionalLabel={false} className="flex-1">
            {(p) => <input {...p} type="search" value={form.q} onChange={set('q')} placeholder="calculator, blue keyring, Main Gate, FD-000042" />}
          </FormField>
          <div className="flex flex-col gap-1.5">
            <span id="type-label" className="text-sm font-semibold">Show</span>
            <div role="group" aria-labelledby="type-label" className="flex h-11 rounded-control border border-line-strong bg-white p-0.5">
              {[['', 'All'], ['lost', 'Lost'], ['found', 'Found']].map(([v, l]) => (
                <button key={l} type="button" aria-pressed={form.type === v} onClick={() => setType(v)}
                  className={cx('rounded-md px-4 text-sm font-semibold', form.type === v ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink')}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" icon={Search}>Search</Button>
            <Button variant="secondary" icon={SlidersHorizontal} aria-expanded={filtersOpen} aria-controls="more-filters" onClick={() => setFiltersOpen((o) => !o)}>
              Filters{active > 0 && ` (${active})`}
            </Button>
          </div>
        </div>

        {filtersOpen && (
          <div id="more-filters" className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField id="categoryId" label="Category" optionalLabel={false}>
              {(p) => (
                <select {...p} value={form.categoryId} onChange={set('categoryId')}>
                  <option value="">Any category</option>
                  {categoryGroups.map((g) => (
                    <optgroup key={g.id} label={g.name}>
                      <option value={g.id}>All {g.name.toLowerCase()}</option>
                      {categories.filter((c) => c.parentId === g.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ))}
                  <optgroup label="More">
                    {categories.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                </select>
              )}
            </FormField>
            <FormField id="zoneId" label="Area of campus" optionalLabel={false}>
              {(p) => (
                <select {...p} value={form.zoneId} onChange={set('zoneId')}>
                  <option value="">Anywhere</option>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              )}
            </FormField>
            <FormField id="locationId" label="Location" optionalLabel={false}>
              {(p) => (
                <select {...p} value={form.locationId} onChange={set('locationId')}>
                  <option value="">Any location{form.zoneId ? ' in this area' : ''}</option>
                  {zoneLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
            </FormField>
            <FormField id="status" label="Status" optionalLabel={false}>
              {(p) => (
                <select {...p} value={form.status} onChange={set('status')}>
                  <option value="">Any status</option><option value="open">Still open</option><option value="returned">Returned or resolved</option>
                </select>
              )}
            </FormField>
            <FormField id="dateFrom" label="From" optionalLabel={false}>
              {(p) => <input {...p} type="date" value={form.dateFrom} onChange={set('dateFrom')} />}
            </FormField>
            <FormField id="dateTo" label="To" optionalLabel={false}>
              {(p) => <input {...p} type="date" value={form.dateTo} onChange={set('dateTo')} />}
            </FormField>
            <FormField id="sort" label="Order" optionalLabel={false}>
              {(p) => (
                <select {...p} value={form.sort} onChange={set('sort')}>
                  <option value="">Open first, newest</option><option value="oldest">Oldest first</option>
                </select>
              )}
            </FormField>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1">Apply</Button>
              {active > 0 && <Button variant="ghost" icon={X} onClick={clear}>Clear</Button>}
            </div>
          </div>
        )}
      </Card>

      <section aria-labelledby="results-title" aria-busy={!data && !error} className="flex flex-col gap-4">
        <h2 id="results-title" className="text-lg font-bold">
          {data ? `${data.total} ${data.total === 1 ? 'item' : 'items'}${active ? ' match your search' : ''}` : 'Results'}
        </h2>
        {error && <Notice type="error">{error}</Notice>}
        {!data && !error && <Spinner label="Searching…" />}
        {data && data.items.length === 0 && (
          <EmptyState icon={PackageSearch} title="Nothing matches yet"
            action={active > 0 ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : null}>
            Try fewer words or a wider date range. If you lost something, report it so a finder can reach you.
          </EmptyState>
        )}
        {data && data.items.length > 0 && (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((item) => <li key={item.id}><ItemCard item={item} /></li>)}
            </ul>
            <Pagination {...data} noun="items" onPage={(p) => { const n = new URLSearchParams(params); n.set('page', p); setParams(n); window.scrollTo(0, 0); }} />
          </>
        )}
      </section>
    </div>
  );
}
