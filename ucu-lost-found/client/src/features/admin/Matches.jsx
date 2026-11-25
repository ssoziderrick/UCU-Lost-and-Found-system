// Potential matches across all reports, with the score breakdown, plus the matching settings.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Settings2, Sparkles } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import { formatDate, usePageTitle } from '../../components/ui';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Spinner, cx } from '../../design/primitives';
import { FormField } from '../../design/FormField';
import { ErrorSummary } from '../../design/forms';
import { Pagination } from '../../design/data';
import useList from './useList';

const PARTS = [['name', 'Name'], ['category', 'Category'], ['location', 'Place'], ['date', 'Date'], ['description', 'Description']];

export default function Matches() {
  usePageTitle('Potential matches');
  const [query, setQuery] = useState({ status: 'suggested', page: 1 });
  const { data, error, reload } = useList('/api/admin/matches', query);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Potential matches"
        description="Lost and found reports the matching engine thinks belong together. Students see these too and decide whether to claim. Nothing is approved automatically." />
      <div role="group" aria-label="Status" className="flex w-fit flex-wrap rounded-control border border-line-strong bg-white p-0.5">
        {[['suggested', 'Suggested'], ['claimed', 'Claimed'], ['dismissed', 'Dismissed by student'], ['expired', 'Expired']].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={query.status === v} onClick={() => setQuery({ status: v, page: 1 })}
            className={cx('min-h-10 rounded-md px-3 text-sm font-semibold', query.status === v ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink')}>{l}</button>
        ))}
      </div>
      {error && <Notice type="error">{error}</Notice>}
      {!data && !error && <Spinner label="Loading matches…" />}
      {data?.items.length === 0 && <EmptyState icon={Sparkles} title="No matches here">New suggestions appear as students report items.</EmptyState>}
      {data?.items.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((m) => (
              <li key={m.id}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {m.score >= 0.7 ? <Badge tone="signal">Strong · {Math.round(m.score * 100)}%</Badge> : <Badge>Possible · {Math.round(m.score * 100)}%</Badge>}
                    {m.notifiedAt && <Badge tone="brand">Owner notified</Badge>}
                    {Number(m.pendingClaims) > 0 && <Badge tone="warning">{m.pendingClaims} claim{Number(m.pendingClaims) > 1 ? 's' : ''} pending</Badge>}
                  </div>
                  <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                    <ReportSide label="Lost" id={m.lostId} title={m.lostTitle} where={m.lostLocation} date={m.lostDate} who={m.lostOwner} />
                    <ArrowRight aria-hidden="true" className="mx-auto hidden size-5 text-muted md:block" />
                    <ReportSide label="Found" id={m.foundId} title={m.foundTitle} where={m.foundLocation} date={m.foundDate} />
                  </div>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {PARTS.map(([k, l]) => (
                      <div key={k} className="rounded-control bg-mist p-2">
                        <dt className="text-xs text-muted">{l} <span className="tabular-nums">× {m.breakdown.weights?.[k]}</span></dt>
                        <dd className="mt-1 flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white" aria-hidden="true"><span className="block h-full bg-brand-400" style={{ width: `${Math.round((m.breakdown.parts?.[k] || 0) * 100)}%` }} /></span>
                          <span className="text-xs font-semibold tabular-nums">{Math.round((m.breakdown.parts?.[k] || 0) * 100)}%</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs text-muted">{m.breakdown.reasons?.join(' · ')}</p>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination {...data} noun="matches" onPage={(p) => setQuery((q) => ({ ...q, page: p }))} />
        </>
      )}
      <SettingsCard onSaved={reload} />
    </div>
  );
}

function ReportSide({ label, id, title, where, date, who }) {
  return (
    <div className="flex min-w-0 flex-col rounded-control border border-line p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label} · <span className="font-mono normal-case">FD-{String(id).padStart(6, '0')}</span></span>
      <Link to={`/reports/${id}`} className="truncate font-semibold text-ink no-underline hover:text-brand-700">{title}</Link>
      <span className="text-sm text-muted">{where} · {formatDate(date)}{who ? ` · ${who}` : ''}</span>
    </div>
  );
}

function SettingsCard({ onSaved }) {
  const { can } = useAuth();
  const editable = can('settings.manage');
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/api/admin/settings/matching').then((d) => setForm(d.settings)).catch((e) => setMessage(e.message)); }, []);
  if (!form) return null;
  const pct = (v) => Math.round(v * 100);
  const total = Object.values(form.weights).reduce((a, b) => a + b, 0);
  const setWeight = (k) => (e) => setForm((f) => ({ ...f, weights: { ...f.weights, [k]: Number(e.target.value) / 100 } }));
  const setNum = (k, scale = 100) => (e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) / scale }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage(''); setSaved('');
    try { const d = await api.put('/api/admin/settings/matching', form); setSaved(d.message); onSaved(); } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  };
  return (
    <Card as="section" aria-labelledby="settings-title" className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <Settings2 aria-hidden="true" className="mt-0.5 size-5 text-brand-700" />
        <div>
          <h2 id="settings-title" className="text-lg font-bold">Matching settings</h2>
          <p className="text-sm text-muted">{editable ? 'Saving re-scores every open lost report straight away.' : 'Only a super admin can change these.'}</p>
        </div>
      </div>
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        <ErrorSummary errors={Object.keys(errors).length ? errors : null} message={message} />
        {saved && <Notice type="success" onClose={() => setSaved('')}>{saved}</Notice>}
        <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-5">
          <legend className="mb-2 text-sm font-semibold">Weights (%) · total <span className={cx('tabular-nums', Math.abs(total - 1) > 0.001 && 'text-danger-700')}>{pct(total)}%</span></legend>
          {PARTS.map(([k, l]) => (
            <FormField key={k} id={`w-${k}`} label={l} optionalLabel={false}>
              {(p) => <input {...p} type="number" min={0} max={100} step={1} value={pct(form.weights[k])} onChange={setWeight(k)} />}
            </FormField>
          ))}
        </fieldset>
        <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-3">
          <FormField id="notifyThreshold" label="Notify at (%)" optionalLabel={false} error={errors.notifyThreshold}>
            {(p) => <input {...p} type="number" min={1} max={100} value={pct(form.notifyThreshold)} onChange={setNum('notifyThreshold')} />}
          </FormField>
          <FormField id="listThreshold" label="List at (%)" optionalLabel={false} error={errors.listThreshold}>
            {(p) => <input {...p} type="number" min={1} max={100} value={pct(form.listThreshold)} onChange={setNum('listThreshold')} />}
          </FormField>
          <FormField id="windowDays" label="Look back (days)" optionalLabel={false} error={errors.windowDays}>
            {(p) => <input {...p} type="number" min={1} max={90} value={form.windowDays} onChange={setNum('windowDays', 1)} />}
          </FormField>
        </fieldset>
        {editable && <Button type="submit" disabled={busy} className="w-fit">{busy ? 'Saving and re-scoring…' : 'Save settings'}</Button>}
      </form>
    </Card>
  );
}
