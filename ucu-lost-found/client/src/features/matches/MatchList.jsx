// Potential matches for the signed-in student's lost reports (dashboard and lost-report page).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, EyeOff, MapPin, Sparkles } from 'lucide-react';
import { api } from '../../api';
import { formatDate } from '../../components/ui';
import { Badge, Button, cx } from '../../design/primitives';
import { categoryIcon } from '../../design/ItemCard';

/** Loads /api/me/matches (optionally for one report) and lets the student dismiss suggestions. */
export function useMatches(reportId) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get(`/api/me/matches${reportId ? `?reportId=${reportId}` : ''}`)
    .then((d) => setItems(d.items)).catch((e) => setError(e.message)), [reportId]);
  useEffect(() => { load(); }, [load]);
  const dismiss = async (id) => { await api.post(`/api/me/matches/${id}/dismiss`); setItems((list) => list.filter((m) => m.id !== id)); };
  return { items, error, dismiss, reload: load };
}

export default function MatchList({ items, onDismiss, showLost = true, limit }) {
  const list = limit ? items.slice(0, limit) : items;
  return (
    <ul className="flex flex-col gap-3">
      {list.map((m) => <MatchCard key={m.id} match={m} onDismiss={onDismiss} showLost={showLost} />)}
    </ul>
  );
}

function MatchCard({ match: m, onDismiss, showLost }) {
  const [busy, setBusy] = useState(false);
  const Icon = categoryIcon(m.found.category);
  const strong = m.strength === 'strong';
  return (
    <li className={cx('flex flex-col gap-3 rounded-card border p-3 sm:flex-row sm:items-center', strong ? 'border-signal-300 bg-signal-50/50' : 'border-line bg-white')}>
      <div className="flex min-w-0 flex-1 gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-mist">
          {m.found.coverImage ? <img src={m.found.coverImage.url} alt="" className="size-full object-cover" /> : <Icon aria-hidden="true" className="size-7 text-muted/70" strokeWidth={1.5} />}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {strong ? <Badge tone="signal"><Sparkles aria-hidden="true" className="mr-1 size-3" />Strong match</Badge> : <Badge>Possible match</Badge>}
            <span className="text-xs tabular-nums text-muted">{Math.round(m.score * 100)}%</span>
            {m.myClaimId && <Badge tone="brand">You’ve claimed it</Badge>}
          </div>
          <Link to={`/reports/${m.found.id}`} className="truncate font-semibold text-ink no-underline hover:text-brand-700">Found: {m.found.title}</Link>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-3" />{m.found.location}</span>
            <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="size-3" />{formatDate(m.found.eventDate)}</span>
            {showLost && <span>for your “{m.lostTitle}”</span>}
          </p>
          <ul className="flex flex-wrap gap-1" aria-label="Why it may match">
            {m.reasons.map((r) => <li key={r} className="rounded bg-white/80 px-1.5 py-0.5 text-[0.7rem] text-muted ring-1 ring-line">{r}</li>)}
          </ul>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" to={`/reports/${m.found.id}`}>{m.myClaimId ? 'View' : 'View and claim'}</Button>
        {!m.myClaimId && (
          <Button size="sm" variant="ghost" icon={EyeOff} disabled={busy}
            onClick={async () => { setBusy(true); try { await onDismiss(m.id); } finally { setBusy(false); } }}>
            Not mine<span className="sr-only">: {m.found.title}</span>
          </Button>
        )}
      </div>
    </li>
  );
}
