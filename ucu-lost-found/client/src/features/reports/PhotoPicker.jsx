// Photo picker for reports: choose or drop up to 4 photos, preview them, mark each public or private,
// pick the cover, remove. Works on queued files (new report) and on saved photos (editing).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Camera, Eye, EyeOff, ImagePlus, Lock, Star, Trash2 } from 'lucide-react';
import { cx } from '../../design/primitives';
import { MAX_PHOTOS } from '../../validation';

/**
 * items: [{ key, url? (saved) | file? (queued), visibility: 'public'|'private', isCover }]
 * Callbacks receive the item. onAdd receives an array of File objects.
 */
export default function PhotoPicker({ items, onAdd, onRemove, onVisibility, onCover, busy = false, error, progress = null }) {
  const inputRef = useRef(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const left = MAX_PHOTOS - items.length;

  // Object URLs for queued files; released when the file leaves the list.
  const previews = useMemo(() => new Map(items.filter((i) => i.file).map((i) => [i.key, URL.createObjectURL(i.file)])), [items]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const take = (fileList) => {
    const files = [...fileList];
    if (files.length) onAdd(files);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => { e.preventDefault(); if (left > 0) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (left > 0 && !busy) take(e.dataTransfer.files); }}
        className={cx('flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-brand-600 bg-brand-50' : error ? 'border-danger-700 bg-danger-50/40' : 'border-line-strong bg-mist/60')}
      >
        <span className="grid size-11 place-items-center rounded-full bg-white text-brand-700 shadow-card"><Camera aria-hidden="true" className="size-5" /></span>
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{left > 0 ? 'Add photos of the item' : 'You’ve added the maximum of 4 photos'}</p>
          <p id={hintId} className="text-sm text-muted">JPG, PNG or WebP, up to 5 MB each. {left > 0 && `${left} more allowed.`} Drag them here or choose files.</p>
        </div>
        <label className={cx('inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line-strong bg-white px-4 font-semibold hover:border-brand-600 hover:text-brand-800 focus-within:outline-3 focus-within:outline-brand-600',
          (left <= 0 || busy) && 'pointer-events-none opacity-55')}>
          <ImagePlus aria-hidden="true" className="size-5" />Choose photos
          <input ref={inputRef} id="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only"
            disabled={left <= 0 || busy} aria-describedby={`${hintId}${error ? ' photos-error' : ''}`} aria-invalid={error ? 'true' : undefined}
            onChange={(e) => take(e.target.files)} />
        </label>
      </div>

      {error && <p id="photos-error" className="text-sm font-medium text-danger-700">{error}</p>}

      {progress !== null && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-mist" role="progressbar" aria-label="Upload progress"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full bg-brand-600 transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-sm text-muted">{progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Processing photos…'}</p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Selected photos">
          {items.map((item, i) => {
            const src = item.url || previews.get(item.key);
            const isPrivate = item.visibility === 'private';
            return (
              <li key={item.key} className={cx('flex flex-col overflow-hidden rounded-card border bg-white', item.isCover ? 'border-brand-600 ring-2 ring-brand-200' : 'border-line')}>
                <div className="relative aspect-square bg-mist">
                  {src && <img src={src} alt={`Photo ${i + 1}${isPrivate ? ' (private)' : ''}`} className="size-full object-cover" />}
                  <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
                    {item.isCover && <span className="inline-flex items-center gap-1 rounded bg-brand-600 px-1.5 py-0.5 text-[0.7rem] font-semibold text-white"><Star aria-hidden="true" className="size-3" />Cover</span>}
                    {isPrivate && <span className="inline-flex items-center gap-1 rounded bg-ink/85 px-1.5 py-0.5 text-[0.7rem] font-semibold text-white"><Lock aria-hidden="true" className="size-3" />Private</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 p-1.5 text-[0.8rem]">
                  <button type="button" disabled={busy} onClick={() => onVisibility(item, isPrivate ? 'public' : 'private')}
                    className="flex min-h-9 items-center gap-1.5 rounded-md px-1.5 text-left font-medium hover:bg-mist disabled:opacity-50">
                    {isPrivate ? <Eye aria-hidden="true" className="size-4 shrink-0" /> : <EyeOff aria-hidden="true" className="size-4 shrink-0" />}
                    {isPrivate ? 'Make public' : 'Make private'}<span className="sr-only"> (photo {i + 1})</span>
                  </button>
                  {!item.isCover && !isPrivate && (
                    <button type="button" disabled={busy} onClick={() => onCover(item)}
                      className="flex min-h-9 items-center gap-1.5 rounded-md px-1.5 text-left font-medium hover:bg-mist disabled:opacity-50">
                      <Star aria-hidden="true" className="size-4 shrink-0" />Use as cover<span className="sr-only"> (photo {i + 1})</span>
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => onRemove(item)}
                    className="flex min-h-9 items-center gap-1.5 rounded-md px-1.5 text-left font-medium text-danger-700 hover:bg-danger-50 disabled:opacity-50">
                    <Trash2 aria-hidden="true" className="size-4 shrink-0" />Remove<span className="sr-only"> photo {i + 1}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** For queued files: the cover is the first public file, matching the server's rule. */
export function withCover(items) {
  const first = items.find((i) => i.visibility === 'public');
  return items.map((i) => ({ ...i, isCover: i === first }));
}
