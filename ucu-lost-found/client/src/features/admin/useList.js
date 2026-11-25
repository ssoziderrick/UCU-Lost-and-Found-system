// Loads a paginated admin list and reloads when the query changes.
import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api';

export default function useList(path, query) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const key = JSON.stringify(query);
  const load = useCallback(() => {
    setError('');
    return api.get(`${path}${qs(JSON.parse(key))}`).then(setData).catch((e) => setError(e.message));
  }, [path, key]);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}
