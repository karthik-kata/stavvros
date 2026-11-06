import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Category, DriftState, Excerpt, Severity } from '../types';

export const SEV_LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export const SEV_BAR: Record<Severity, string> = { critical: 'bg-crit', high: 'bg-drift', medium: 'bg-warn', low: 'bg-line' };
export const SEV_TEXT: Record<Severity, string> = { critical: 'text-crit', high: 'text-drift', medium: 'text-warn', low: 'text-muted' };
export const SEV_CHIP: Record<Severity, string> = {
  critical: 'bg-crit-soft text-crit', high: 'bg-drift-soft text-drift', medium: 'bg-warn-soft text-warn', low: 'bg-sunken text-muted',
};
export const CATEGORY_LABEL: Record<Category, string> = {
  contract: 'API contract', behavior: 'Business rule', events: 'Events', coverage: 'Missing docs', integration: 'Service-to-service',
};
export const STATE_LABEL: Record<DriftState, string> = {
  open: 'Needs a decision', change_drafted: 'Fix drafted', in_review: 'In review', issue_open: 'Issue open',
  resolved: 'Resolved', dismissed: 'Dismissed',
};
export const isActive = (s: DriftState) => s === 'open' || s === 'change_drafted' || s === 'in_review' || s === 'issue_open';

export function SeverityChip({ severity }: { severity: Severity }) {
  return <span className={`chip ${SEV_CHIP[severity]}`}>{SEV_LABEL[severity].toUpperCase()}</span>;
}

export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function time(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** A section that starts closed: the next level of detail. */
export function Disclosure({ title, hint, children, defaultOpen = false }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-line">
      <button
        className="flex w-full items-center gap-2 py-3 text-left hover:text-ink"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight size={16} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="font-medium">{title}</span>
        {hint && <span className="truncate text-[12.5px] text-muted">{hint}</span>}
      </button>
      {open && <div className="pb-5 pl-6">{children}</div>}
    </section>
  );
}

export function CodeExcerpt({ ex, tone }: { ex: Excerpt; tone: 'doc' | 'code' }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-sunken py-1.5 font-mono text-[11.5px] leading-[1.65]">
      {ex.lines.map((l, i) => {
        const n = ex.start_line + i;
        const hi = ex.highlight.includes(n);
        return (
          <div key={n} className={`flex gap-3 px-2.5 ${hi ? (tone === 'doc' ? 'bg-drift-soft' : 'bg-accent-soft') : ''}`}>
            <span className="w-6 shrink-0 select-none text-right text-muted">{n}</span>
            <span className="whitespace-pre-wrap break-words">{l || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </span>
  );
}

export function fileName(p: string) {
  return p.split('/').pop() ?? p;
}
