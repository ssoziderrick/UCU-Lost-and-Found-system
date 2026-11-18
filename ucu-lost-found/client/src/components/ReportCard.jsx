import { Link } from 'react-router-dom';
import { StatusBadge, TypeBadge, formatDate } from './ui';

const ICONS = { Keys: '🔑', 'Phones & Electronics': '📱', Bags: '🎒', 'Books & Stationery': '📚', 'ID & Cards': '🪪',
  Clothing: '👕', 'Jewellery & Accessories': '💍', 'Water Bottles & Flasks': '🧴', Documents: '📄', Other: '📦' };

export default function ReportCard({ r }) {
  const done = r.status === 'returned' || r.status === 'closed';
  return (
    <article className={`card report-card${done ? ' is-done' : ''}`}>
      <div className="thumb" aria-hidden="true">
        {r.hasPhoto ? <img src={`/api/reports/${r.id}/photo`} alt="" loading="lazy" /> : <span className="thumb-icon">{ICONS[r.category] || '📦'}</span>}
      </div>
      <div className="card-body">
        <div className="badges"><TypeBadge type={r.type} /><StatusBadge status={r.status} /></div>
        <h3><Link to={`/reports/${r.id}`} className="stretched">{r.title}</Link></h3>
        <p className="meta">
          <span>{r.category}</span> · <span>{r.location}</span>
        </p>
        <p className="meta">{r.type === 'lost' ? 'Lost' : 'Found'} on <time dateTime={r.eventDate}>{formatDate(r.eventDate)}</time></p>
      </div>
    </article>
  );
}
