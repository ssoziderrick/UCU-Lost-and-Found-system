// Loads categories and campus locations once and caches them for the session.
import { useEffect, useState } from 'react';
import { api } from './api';

let cache = null;

export default function useMeta() {
  const [meta, setMeta] = useState(cache || { categories: [], locations: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    if (cache) return;
    api.get('/api/reports/meta')
      .then((d) => { cache = d; setMeta(d); })
      .catch((e) => setError(e.message));
  }, []);
  return { ...meta, metaError: error };
}
