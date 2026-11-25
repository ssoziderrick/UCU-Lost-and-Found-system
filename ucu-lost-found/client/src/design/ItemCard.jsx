// Listing card for a lost or found report. Uses only public fields from the API.
import { Link } from 'react-router-dom';
import {
  Backpack, BookOpen, Calculator, CalendarDays, FileText, Gem, Glasses, IdCard, KeyRound, Laptop, MapPin, Milk, Package, Shirt, Smartphone, Umbrella,
} from 'lucide-react';
import { StatusBadge, TypeBadge, cx } from './primitives';
import { formatDate } from '../components/ui';

const CATEGORY_ICONS = {
  Keys: KeyRound,
  'Phones & Electronics': Smartphone,
  Bags: Backpack,
  'Books & Stationery': BookOpen,
  'ID & Cards': IdCard,
  Clothing: Shirt,
  'Jewellery & Accessories': Gem,
  'Water Bottles & Flasks': Milk,
  Documents: FileText,
  'Laptops & Chargers': Laptop,
  'Calculators & Academic Equipment': Calculator,
  Umbrellas: Umbrella,
  Eyewear: Glasses,
};

export const categoryIcon = (name) => CATEGORY_ICONS[name] || Package;

export default function ItemCard({ item, headingLevel: H = 'h3' }) {
  const Icon = categoryIcon(item.category);
  const done = item.status === 'returned' || item.status === 'closed';
  return (
    <article className={cx(
      'group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-white transition-shadow duration-150',
      'hover:shadow-pop focus-within:shadow-pop',
      done && 'opacity-80',
    )}>
      <div className="grid aspect-[16/10] place-items-center overflow-hidden bg-mist">
        {item.coverImage
          ? <img src={item.coverImage.url} alt="" loading="lazy" className="size-full object-cover" />
          : <Icon aria-hidden="true" className="size-10 text-muted/70" strokeWidth={1.5} />}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge type={item.type} /><StatusBadge status={item.status} />
          {item.refCode && <span className="ml-auto font-mono text-[0.7rem] text-muted">{item.refCode}</span>}
        </div>
        <H className="text-base font-bold leading-snug">
          {/* The link covers the whole card; the ::after keeps one tab stop per card. */}
          <Link to={`/reports/${item.id}`} className="text-ink no-underline after:absolute after:inset-0 hover:text-brand-700">
            {item.title}
          </Link>
        </H>
        <dl className="mt-auto flex flex-col gap-1 text-sm text-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Location</dt>
            <MapPin aria-hidden="true" className="size-4 shrink-0" /><dd className="truncate">{item.location}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{item.type === 'lost' ? 'Date lost' : 'Date found'}</dt>
            <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
            <dd>{item.type === 'lost' ? 'Lost' : 'Found'} <time dateTime={item.eventDate}>{formatDate(item.eventDate)}</time></dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
