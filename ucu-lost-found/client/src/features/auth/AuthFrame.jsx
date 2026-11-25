// Two-panel frame for sign-in, activation and recovery: deep-blue brand panel beside the form.
// On phones the brand panel collapses to a short strip above the form.
import { Logo } from '../../design/Logo';

export default function AuthFrame({ title, intro, children, aside }) {
  return (
    <div className="mx-auto flex max-w-5xl px-4 py-6 sm:px-6 md:py-12">
      <div className="grid w-full overflow-hidden rounded-card border border-line bg-white shadow-card md:grid-cols-[1fr_1.1fr]">
        <div className="relative flex flex-col justify-between gap-6 overflow-hidden bg-brand-800 px-6 py-6 text-white md:px-10 md:py-10">
          <Logo size={30} tone="dark" inner="#1E3A8A" />
          <div className="relative hidden flex-col gap-3 md:flex">
            <p className="font-display text-[1.9rem] font-bold leading-tight tracking-tight">Lost it on campus? Let’s get it back.</p>
            <p className="max-w-sm text-brand-100">Your campus. Your community. One place to reconnect lost belongings with their owners.</p>
          </div>
          {aside && <div className="relative hidden text-sm text-brand-100 md:block">{aside}</div>}
          <svg aria-hidden="true" viewBox="0 0 64 72" className="pointer-events-none absolute -bottom-10 -right-10 hidden w-64 text-brand-300 opacity-15 md:block">
            <path d="M32 2 60 9.5V33c0 18.5-12.6 30.3-28 37C16.6 63.3 4 51.5 4 33V9.5z" fill="currentColor" />
          </svg>
        </div>
        <div className="flex flex-col gap-5 px-5 py-7 sm:px-8 md:px-10 md:py-10">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {intro && <div className="text-muted">{intro}</div>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
