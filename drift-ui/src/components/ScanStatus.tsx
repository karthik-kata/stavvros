import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ScanReport } from '../types';
import { ago } from './ui';

/** Top-bar scan control. The pipeline numbers stay one click away. */
export function ScanStatus({ report, scanning, onScan }: { report: ScanReport | null; scanning: boolean; onScan: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const facts = report ? Object.values(report.facts).reduce((a, b) => a + b, 0) : 0;
  const claims = report ? Object.values(report.claims).reduce((a, b) => a + b, 0) : 0;
  const llmCalls = report ? Object.entries(report.llm_calls).filter(([k]) => k !== 'cache hits').reduce((a, [, b]) => a + b, 0) : 0;

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <button className="text-[12.5px] text-muted hover:text-ink" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {report ? `Scanned ${ago(report.scanned_at)}` : 'Not scanned'}
      </button>
      <button className="btn" disabled={scanning} onClick={onScan}>
        <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />{scanning ? 'Scanning' : 'Scan'}
      </button>
      {open && report && (
        <div className="absolute right-0 top-11 z-40 w-[380px] rounded-xl border border-ink bg-panel p-4 text-[13px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          <div className="eyebrow mb-2">Last scan · {report.codebase} · {report.duration_ms} ms</div>
          <ol className="flex flex-col gap-2.5">
            <Step who="AST" title={`${report.files_parsed} Python files → ${facts} code facts`} detail={Object.entries(report.facts).map(([k, v]) => `${v} ${k}`).join(', ')} />
            <Step who="Parser" title={`${report.docs_parsed} docs → ${claims} claims`} detail={Object.entries(report.claims).map(([k, v]) => `${v} ${k}`).join(', ')} />
            <Step who="LLM" title={`${llmCalls} calls to ${report.llm_backend}`} detail={Object.entries(report.llm_calls).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ')} />
            <Step who="Result" title={`${Object.values(report.findings).reduce((a, b) => a + b, 0)} drifts, ${report.verified_claims} claims verified`} detail={Object.entries(report.findings).map(([k, v]) => `${v} ${k}`).join(', ')} />
          </ol>
        </div>
      )}
    </div>
  );
}

function Step({ who, title, detail }: { who: string; title: string; detail: string }) {
  const cls = who === 'LLM' ? 'bg-drift-soft text-drift' : who === 'Result' ? 'bg-ok-soft text-ok' : 'bg-accent-soft text-accent';
  return (
    <li className="grid grid-cols-[54px_1fr] gap-3">
      <span className={`chip h-fit justify-center ${cls}`}>{who}</span>
      <span><span className="font-medium">{title}</span><span className="block text-[12px] text-muted">{detail}</span></span>
    </li>
  );
}
