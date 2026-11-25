import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../AuthContext';
import useMeta from '../useMeta';
import ReportCard from '../components/ReportCard';
import { Alert, EmptyState, Loading, usePageTitle } from '../components/ui';

const FILTER_KEYS = ['q', 'type', 'categoryId', 'locationId', 'dateFrom', 'dateTo', 'status'];

export default function Browse() {
  usePageTitle('Browse lost and found items');
  const { user, isAdmin } = useAuth();
  const { categories, locations } = useMeta();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [form, setForm] = useState(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const page = Number(params.get('page')) || 1;
  // On phones the advanced filters start collapsed so results are reachable quickly.
  const [moreOpen] = useState(() => window.matchMedia('(min-width: 900px)').matches
    || ['categoryId', 'locationId', 'dateFrom', 'dateTo', 'status'].some((k) => params.get(k)));

  // Clear one-time flash message from history state
  useEffect(() => { if (location.state?.flash) navigate(location.pathname + location.search, { replace: true, state: null }); }, []); // eslint-disable-line

  useEffect(() => {
    let cancelled = false;
    setData(null); setError('');
    const query = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
    api.get(`/api/reports${qs({ ...query, page })}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [params, page]);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    if (form.dateFrom && form.dateTo && form.dateFrom > form.dateTo) {
      setError('The "From" date must be on or before the "To" date. Please adjust the dates.');
      return;
    }
    const next = new URLSearchParams(qs(form));
    setParams(next);
  };
  const reset = () => { const empty = Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])); setForm(empty); setParams({}); };
  const goPage = (p) => { const n = new URLSearchParams(params); n.set('page', p); setParams(n); window.scrollTo(0, 0); };
  const activeFilters = FILTER_KEYS.some((k) => params.get(k));

  return (
    <>
      <Alert type="success" onClose={() => setFlash('')}>{flash}</Alert>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="hero-kicker">UCU Campus Service</span>
          <h1 id="hero-title">Lost something on campus?<br />Found something?</h1>
          <p>Search reports across UCU or submit a new item. Ownership is verified privately before anything is returned.</p>
          {!isAdmin && (
            <div className="hero-actions">
              <Link className="btn btn-accent" to={user ? '/reports/new?type=lost' : '/login'} state={user ? undefined : { from: '/reports/new?type=lost' }}>I lost something</Link>
              <Link className="btn btn-light" to={user ? '/reports/new?type=found' : '/login'} state={user ? undefined : { from: '/reports/new?type=found' }}>I found something</Link>
            </div>
          )}
        </div>
        <div className="hero-note" aria-label="How the service works">
          <span className="hero-note-icon" aria-hidden="true">✓</span>
          <div>
            <strong>Private and secure</strong>
            <span>Public details only</span>
          </div>
        </div>
      </section>

      <div className="browse-layout">
        <section className="filters card" aria-labelledby="filter-title">
          <h2 id="filter-title">Search &amp; filter</h2>
          <form onSubmit={submit} role="search">
            <div className="field">
              <label htmlFor="q">Keyword</label>
              <input id="q" name="q" type="search" value={form.q} onChange={update} placeholder="e.g. keys, phone, blue" />
            </div>
            <fieldset className="field">
              <legend>Report type</legend>
              <div className="segmented">
                {[['', 'All'], ['lost', 'Lost'], ['found', 'Found']].map(([v, l]) => (
                  <label key={v || 'all'}><input type="radio" name="type" value={v} checked={form.type === v} onChange={update} /><span>{l}</span></label>
                ))}
              </div>
            </fieldset>
            <details className="more-filters" open={moreOpen}>
              <summary>More filters (category, location, date, status)</summary>
            <div className="field">
              <label htmlFor="categoryId">Category</label>
              <select id="categoryId" name="categoryId" value={form.categoryId} onChange={update}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="locationId">Campus location</label>
              <select id="locationId" name="locationId" value={form.locationId} onChange={update}>
                <option value="">All locations</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="dateFrom">From date</label>
                <input id="dateFrom" name="dateFrom" type="date" value={form.dateFrom} onChange={update} />
              </div>
              <div className="field">
                <label htmlFor="dateTo">To date</label>
                <input id="dateTo" name="dateTo" type="date" value={form.dateTo} onChange={update} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" value={form.status} onChange={update}>
                <option value="">Any status</option>
                <option value="open">Still open</option>
                <option value="returned">Returned / resolved</option>
              </select>
            </div>
            </details>
            <div className="btn-row">
              <button type="submit" className="btn btn-primary">Search</button>
              <button type="button" className="btn btn-ghost" onClick={reset}>Clear</button>
            </div>
          </form>
        </section>

        <section className="results" aria-labelledby="results-title" aria-busy={!data && !error}>
          <h2 id="results-title" className="results-title">
            {data ? `${data.total} item${data.total === 1 ? '' : 's'}${activeFilters ? ' match your search' : ''}` : 'Items'}
          </h2>
          <Alert type="error">{error}</Alert>
          {!data && !error && <Loading label="Loading items…" />}
          {data && data.items.length === 0 && (
            <EmptyState title="No items found">
              <p>Try a different keyword, widen the date range, or clear the filters.</p>
              {user && !isAdmin && <p>Still missing something? <Link to="/reports/new?type=lost">Report it as lost</Link> so a finder can match it.</p>}
            </EmptyState>
          )}
          {data && data.items.length > 0 && (
            <>
              <ul className="grid" aria-label="Search results">
                {data.items.map((r) => <li key={r.id}><ReportCard r={r} /></li>)}
              </ul>
              {data.totalPages > 1 && (
                <nav className="pagination" aria-label="Results pages">
                  <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => goPage(page - 1)}>← Previous</button>
                  <span aria-current="page">Page {page} of {data.totalPages}</span>
                  <button type="button" className="btn btn-ghost" disabled={page >= data.totalPages} onClick={() => goPage(page + 1)}>Next →</button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
