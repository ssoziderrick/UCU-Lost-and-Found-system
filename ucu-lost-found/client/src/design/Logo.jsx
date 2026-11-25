// UCU Findora badge: an original shield (not the official UCU crest) with "UCU" across the top
// and a location pin holding a returning arrow. Needs university approval before public launch.
import { useId } from 'react';

const SHIELD = 'M32 2 60 9.5V33c0 18.5-12.6 30.3-28 37C16.6 63.3 4 51.5 4 33V9.5z';
const INNER = 'M32 6.6 55.6 13v20c0 15.8-10.5 26.3-23.6 32.6C18.9 59.3 8.4 48.8 8.4 33V13z';
const PIN = 'M32 35c-5.8 0-10.5 4.5-10.5 10.1 0 7.6 10.5 15.9 10.5 15.9s10.5-8.3 10.5-15.9C42.5 39.5 37.8 35 32 35z';
const ARROW_U = 'M28 40.5v3.7a4 4 0 0 0 8 0v-3.7';
const ARROW_HEAD = 'M33.4 42.8l2.6-2.6 2.6 2.6';

/**
 * variant "color": blue shield, pink pin (for white or light backgrounds).
 * variant "mono": one colour (currentColor) with details cut out in `inner` (for dark backgrounds).
 */
export function Badge({ size = 32, variant = 'color', inner = '#172033', title, className = '' }) {
  const titleId = useId();
  const mono = variant === 'mono';
  const detail = mono ? inner : '#FFFFFF';
  return (
    <svg
      viewBox="0 0 64 72" width={size} height={Math.round(size * 1.125)} className={className}
      role={title ? 'img' : undefined} aria-labelledby={title ? titleId : undefined} aria-hidden={title ? undefined : true}
    >
      {title && <title id={titleId}>{title}</title>}
      <path d={SHIELD} fill={mono ? 'currentColor' : '#1E3A8A'} />
      <path d={INNER} fill="none" stroke={mono ? inner : '#93C5FD'} strokeWidth="1.4" />
      <text x="32" y="25.5" textAnchor="middle" fontFamily="'Plus Jakarta Sans Variable','Segoe UI',Arial,sans-serif"
        fontWeight="800" fontSize="12.5" letterSpacing="1.2" fill={detail}>UCU</text>
      <path d="M17 30.5h30" stroke={mono ? inner : '#F472B6'} strokeWidth="1.6" strokeLinecap="round" />
      <path d={PIN} fill={mono ? inner : '#EC4899'} />
      <path d={ARROW_U} fill="none" stroke={mono ? 'currentColor' : '#FFFFFF'} strokeWidth="2.3" strokeLinecap="round" />
      <path d={ARROW_HEAD} fill="none" stroke={mono ? 'currentColor' : '#FFFFFF'} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Badge + "UCU Findora" wordmark. `tone="dark"` is for navy or deep-blue backgrounds. */
export function Logo({ size = 28, tone = 'light', inner = '#172033', className = '' }) {
  const dark = tone === 'dark';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Badge size={size} variant={dark ? 'mono' : 'color'} inner={inner} className={dark ? 'text-white' : ''} />
      <span className={`font-display text-[1.1rem] font-extrabold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>
        <span className={dark ? 'text-brand-300' : 'text-brand-600'}>UCU</span> Findora
      </span>
    </span>
  );
}
