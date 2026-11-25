// Kept so existing pages keep working; new code should import design/ItemCard directly.
import ItemCard from '../design/ItemCard';

export default function ReportCard({ r }) {
  return <ItemCard item={r} />;
}
