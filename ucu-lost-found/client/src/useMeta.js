// Loads categories, category groups, campus locations and zones once and caches them for the session.
import { useEffect, useState } from 'react';
import { api } from './api';

const EMPTY = { categories: [], categoryGroups: [], locations: [], zones: [] };
let cache = null;

/** Call after an admin changes locations or categories, so forms pick up the change. */
export function invalidateMeta() { cache = null; }

export default function useMeta() {
  const [meta, setMeta] = useState(cache || EMPTY);
  const [error, setError] = useState('');
  useEffect(() => {
    if (cache) return;
    api.get('/api/reports/meta')
      .then((d) => { cache = { ...EMPTY, ...d }; setMeta(cache); })
      .catch((e) => setError(e.message));
  }, []);
  return { ...meta, metaError: error };
}
