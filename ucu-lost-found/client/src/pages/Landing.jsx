// Public landing page. Every figure and item shown comes from the API.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Camera, ClipboardList, EyeOff, Handshake, IdCard, Lock, MapPin, PackageSearch, Search, ShieldCheck,
} from 'lucide-react';
import { api } from '../api';
import useMeta from '../useMeta';
import { usePageTitle } from '../components/ui';
import { Badge as Shield } from '../design/Logo';
import { Button, EmptyState, Notice, Spinner } from '../design/primitives';
import ItemCard from '../design/ItemCard';

const STEPS = [
  { icon: Camera, title: 'Report it', text: 'Lost something? Describe it and where you last had it. Found something? Add a photo, the place you found it, and the details only the owner would know.' },
  { icon: Search, title: 'Search the listings', text: 'Filter by category, campus location and date. Every report on campus is in one place instead of scattered across WhatsApp groups.' },
  { icon: ClipboardList, title: 'Claim it privately', text: 'Explain why the item is yours. Only you and the lost-property office can read your claim.' },
  { icon: Handshake, title: 'Collect with your ID', text: 'The office checks your claim against the finder’s private details, then tells you where and when to collect it.' },
];

const PRIVACY = [
  { icon: EyeOff, title: 'Identifying details stay private', text: 'Serial numbers, inscriptions and ID numbers go in a private field that only the finder and the office can see. They never appear in public listings.' },
  { icon: Lock, title: 'Claims are confidential', text: 'Your explanation of why an item is yours is visible only to you and the administrators reviewing it.' },
  { icon: ShieldCheck, title: 'A person checks every handover', text: 'Nothing is released automatically. The office approves one claim per item, records the reason, and confirms the return only after collection.' },
];

const FAQ = [
  ['Who can use UCU Findora?', 'Students with an account can report items and submit claims. Anyone can browse the public listings to check whether something has been handed in.'],
  ['I found something. What should I do?', 'Report it as found, add a photo if you can, and put any identifying marks in the private field. Then hand the item to the lost-property office so the owner can collect it safely.'],
  ['What should I leave out of a public description?', 'Anything that proves ownership: serial numbers, names written inside, ID numbers, phone lock screens, inscriptions. Keep these for the private field so only the real owner can describe them in a claim.'],
  ['How is ownership checked?', 'An administrator compares your claim with the finder’s private details and any competing claims, then approves or rejects it with a reason. If approved, you get collection instructions.'],
  ['Where do I collect my item?', 'At the place given in your approval, usually the lost-property office. Bring your student ID. The item is marked returned only once it is in your hands.'],
  ['Is this an official university service?', 'Not yet. UCU Findora is a student project built for the UCU community and needs university approval before it becomes an official service.'],
];

export default function Landing() {
  usePageTitle('Lost it on campus? Let’s get it back');
  const navigate = useNavigate();
  const location = useLocation();
  const { locations, metaError } = useMeta();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(location.state?.flash || '');

  useEffect(() => {
    api.get('/api/reports?status=open')
      .then((d) => setRecent({ items: d.items.slice(0, 6), total: d.total }))
      .catch((e) => setError(e.message));
  }, []);

  // In-page links such as /#faq: scroll after the shell has finished its own route handling.
  useEffect(() => {
    if (!location.hash) return undefined;
    const t = setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    return () => clearTimeout(t);
  }, [location.hash]);

  const search = (e) => {
    e.preventDefault();
    navigate(q.trim() ? `/items?q=${encodeURIComponent(q.trim())}` : '/items');
  };

  const campus = locations.filter((l) => !/^other/i.test(l.name));

  return (
    <>
      {/* Hero */}
      <section aria-labelledby="hero-title" className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div className="flex flex-col gap-6">
            {flash && <Notice type="success" onClose={() => setFlash('')}>{flash}</Notice>}
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-700">For the UCU community</p>
            <h1 id="hero-title" className="text-[2.1rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Lost it on campus? <span className="text-brand-600">Let’s get it back.</span>
            </h1>
            <p className="max-w-xl text-lg text-muted">
              Your campus. Your community. One place to reconnect lost belongings with their owners.
            </p>
            <form role="search" onSubmit={search} className="flex max-w-xl flex-col gap-2 sm:flex-row">
              <label htmlFor="hero-search" className="sr-only">Search lost and found items</label>
              <div className="relative flex-1">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
                <input id="hero-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Search: calculator, keys, blue bottle…"
                  className="block min-h-12 w-full rounded-control border border-line-strong bg-white pl-10 pr-3 text-ink placeholder:text-muted/80 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-200" />
              </div>
              <Button type="submit" size="lg">Search</Button>
            </form>
            <div className="flex flex-wrap gap-3">
              <Button to="/reports/new?type=lost" variant="primary" size="lg" icon={PackageSearch}>I lost something</Button>
              <Button to="/reports/new?type=found" variant="secondary" size="lg" icon={Camera}>I found something</Button>
            </div>
          </div>

          <aside aria-label="At a glance" className="rounded-card border border-line bg-brand-50/60 p-6">
            <div className="flex items-start gap-4">
              <Shield size={52} />
              <div className="flex flex-col gap-1">
                <p className="font-display text-lg font-bold">UCU Findora</p>
                <p className="text-sm text-muted">The campus lost-property service, from report to handover.</p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-control bg-white p-4">
                <dt className="text-sm text-muted">Open reports right now</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">{recent ? recent.total : error ? '–' : '…'}</dd>
              </div>
              <div className="rounded-control bg-white p-4">
                <dt className="text-sm text-muted">Campus locations covered</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">{campus.length || (metaError ? '–' : '…')}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      {/* Recently reported */}
      <section aria-labelledby="recent-title" className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="recent-title" className="text-2xl font-bold tracking-tight">Recently reported</h2>
            <p className="text-muted">The newest open lost and found reports on campus.</p>
          </div>
          <Link to="/items" className="inline-flex items-center gap-1 font-semibold text-brand-700">Browse all items <ArrowRight aria-hidden="true" className="size-4" /></Link>
        </div>
        {error && <Notice type="error" title="We couldn’t load recent items.">{error}</Notice>}
        {!recent && !error && <Spinner label="Loading recent items…" />}
        {recent && recent.items.length === 0 && (
          <EmptyState icon={PackageSearch} title="Nothing reported yet"
            action={<Button to="/reports/new">Report the first item</Button>}>
            When students report lost or found items, the newest ones appear here.
          </EmptyState>
        )}
        {recent && recent.items.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.items.map((item) => <li key={item.id}><ItemCard item={item} /></li>)}
          </ul>
        )}
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 border-y border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-14 sm:px-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 id="how-title" className="text-2xl font-bold tracking-tight">How it works</h2>
            <p className="text-muted">Four steps from “I can’t find it” to having it back in your hands.</p>
          </div>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-brand-600 text-white"><Icon aria-hidden="true" className="size-5" /></span>
                  <span className="text-sm font-semibold text-muted">Step {i + 1}</span>
                </div>
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Campus */}
      <section aria-labelledby="campus-title" className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-3">
          <h2 id="campus-title" className="text-2xl font-bold tracking-tight">Made for UCU Mukono</h2>
          <p className="text-muted">
            Reports are tied to real places on campus, from the libraries and lecture blocks to the gates and sports grounds.
            Pick the spot from a list instead of guessing how someone else might describe it, and add a note if it isn’t listed.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-base font-semibold"><MapPin aria-hidden="true" className="size-4 text-brand-600" />Locations you can choose from</h3>
          {metaError && <Notice type="error">{metaError}</Notice>}
          {!metaError && campus.length === 0 && <Spinner label="Loading campus locations…" className="py-2" />}
          <ul className="flex flex-wrap gap-2">
            {campus.map((l) => (
              <li key={l.id}>
                <Link to={`/items?locationId=${l.id}`} className="inline-flex min-h-9 items-center rounded-full border border-line bg-white px-3 text-sm text-ink no-underline hover:border-brand-600 hover:text-brand-800">
                  {l.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Privacy */}
      <section aria-labelledby="privacy-title" className="border-y border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-14 sm:px-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 id="privacy-title" className="text-2xl font-bold tracking-tight">Privacy and security</h2>
            <p className="text-muted">Built so the right person gets the item back, and nobody else learns what they shouldn’t.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {PRIVACY.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex flex-col gap-2">
                <Icon aria-hidden="true" className="size-6 text-brand-600" />
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-title" className="mx-auto flex max-w-3xl scroll-mt-20 flex-col gap-6 px-4 py-14 sm:px-6">
        <h2 id="faq-title" className="text-2xl font-bold tracking-tight">Frequently asked questions</h2>
        <div className="divide-y divide-line rounded-card border border-line bg-white">
          {FAQ.map(([question, answer]) => (
            <details key={question} className="group px-5">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {question}
                <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
              </summary>
              <p className="pb-5 text-muted">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section aria-labelledby="cta-title" className="bg-brand-800">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <h2 id="cta-title" className="text-2xl font-bold tracking-tight text-white">One campus. One community. Everything found.</h2>
            <p className="text-brand-100">Create an account to report items and claim what’s yours.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button to="/register" variant="inverse" size="lg" icon={IdCard}>Create an account</Button>
            <Button to="/login" variant="ghost" size="lg" className="text-white hover:bg-white/10 hover:text-white">Log in</Button>
          </div>
        </div>
      </section>
    </>
  );
}
