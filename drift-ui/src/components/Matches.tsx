import { CheckCircle2, HelpCircle } from 'lucide-react';
import type { Claims } from '../types';

/** Claims that held up: shows the scan is not only finding problems. */
export function Matches({ claims }: { claims: Claims | null }) {
  if (!claims) return null;
  const byDoc = new Map<string, Claims['verified']>();
  claims.verified.forEach((v) => byDoc.set(v.doc_title, [...(byDoc.get(v.doc_title) ?? []), v]));
  return (
    <article className="mx-auto flex max-w-[860px] flex-col gap-6 px-8 py-7">
      <div>
        <h1 className="font-display text-[26px] font-semibold">What still matches</h1>
        <p className="mt-1 text-ink-soft">{claims.verified.length} statements in the docs were checked against the code and agree.</p>
      </div>
      {[...byDoc.entries()].map(([doc, items]) => (
        <section key={doc}>
          <h2 className="mb-2 font-semibold">{doc} <span className="font-normal text-muted">· {items.length}</span></h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {items.map((v) => (
              <li key={v.claim.id} className="grid grid-cols-[18px_1fr_auto] items-start gap-3 px-4 py-2.5">
                <CheckCircle2 size={16} className="mt-0.5 text-ok" />
                <span className="min-w-0">
                  <span className="block truncate">{v.claim.text.replace(/`/g, '')}</span>
                  <span className="block truncate font-mono text-[11.5px] text-muted">{v.evidence}</span>
                </span>
                <span className={`chip ${v.engine === 'ast' ? 'bg-accent-soft text-accent' : 'bg-drift-soft text-drift'}`}>{v.engine === 'ast' ? 'AST' : 'AST+LLM'}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {claims.unverified.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Could not check <span className="font-normal text-muted">· {claims.unverified.length}</span></h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {claims.unverified.map((c) => (
              <li key={c.id} className="grid grid-cols-[18px_1fr] gap-3 px-4 py-2.5 text-muted">
                <HelpCircle size={16} className="mt-0.5" />{c.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
