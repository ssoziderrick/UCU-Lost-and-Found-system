// The signed-in student's own reports, newest first, with quick edit links.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, Camera, FileText, Images, MapPin, PackageSearch, Pencil } from 'lucide-react';
import { api } from '../../api';
import { formatDate, usePageTitle } from '../../components/ui';
import { Badge, Button, EmptyState, Notice, PageHeader, Spinner, StatusBadge, TypeBadge } from '../../design/primitives';
import { categoryIcon } from '../../design/ItemCard';

export default function MyReports() {
  usePageTitle('My reports');
  const location = useLocation();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(location.state?.flash || '');
  useEffect(() => { api.get('/api/me/reports').then((d) => setItems(d.items)).catch((e) => setError(e.message)); }, []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-8">
      <PageHeader title="My reports" description="Everything you’ve reported as lost or found."
        actions={(
          <>
            <Button to="/reports/new?type=found" variant="secondary" icon={Camera}>I found something</Button>
            <Button to="/reports/new?type=lost" icon={PackageSearch}>I lost something</Button>
          </>
        )} />
      {flash && <Notice type="success" onClose={() => setFlash('')}>{flash}</Notice>}
      {error && <Notice type="error">{error}</Notice>}
      {!items && !error && <Spinner label="Loading your reports…" />}
      {items?.length === 0 && (
        <EmptyState icon={FileText} title="You haven’t reported anything yet" action={<Button to="/reports/new">Report an item</Button>}>
          Lost or found something on campus? A report takes about two minutes.
        </EmptyState>
      )}
      {items?.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((r) => {
            const Icon = categoryIcon(r.category);
            return (
              <li key={r.id} className="flex gap-4 rounded-card border border-line bg-white p-3 sm:p-4">
                <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-control bg-mist sm:size-24">
                  {r.coverImage ? <img src={r.coverImage.url} alt="" className="size-full object-cover" /> : <Icon aria-hidden="true" className="size-8 text-muted/70" strokeWidth={1.5} />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TypeBadge type={r.type} /><StatusBadge status={r.status} />
                    {Number(r.pendingClaims) > 0 && <Badge tone="signal">{r.pendingClaims} claim{Number(r.pendingClaims) > 1 ? 's' : ''} under review</Badge>}
                    <span className="font-mono text-xs text-muted">{r.refCode}</span>
                  </div>
                  <Link to={`/reports/${r.id}`} className="truncate font-semibold text-ink no-underline hover:text-brand-700">{r.title}</Link>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5" />{r.location}</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="size-3.5" />{formatDate(r.eventDate)}</span>
                    <span className="inline-flex items-center gap-1"><Images aria-hidden="true" className="size-3.5" />{r.imageCount} photo{Number(r.imageCount) === 1 ? '' : 's'}</span>
                  </p>
                </div>
                {r.status === 'open' && (
                  <Link to={`/reports/${r.id}/edit`} className="flex h-10 shrink-0 items-center gap-1.5 self-center rounded-control px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                    <Pencil aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Edit</span><span className="sr-only"> {r.title}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
