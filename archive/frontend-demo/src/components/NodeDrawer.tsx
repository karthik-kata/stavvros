import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import type { NodeDetailsResponse } from '../types';
import { Spinner } from './ui';
import { nodeHeading } from './SystemMap';

type Tab = 'overview' | 'spec' | 'source' | 'api';

export function NodeDrawer({ nodeId, onClose, onOpenDrift }: { nodeId: string | null; onClose: () => void; onOpenDrift: (id: string) => void }) {
  const [d, setD] = useState<NodeDetailsResponse | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [file, setFile] = useState('');
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    if (!nodeId) return setD(null);
    setD(null);
    api.getNode(nodeId).then((x) => {
      setD(x);
      setTab(x.blueprint ? 'overview' : x.spec ? 'spec' : 'api');
      setFile(Object.keys(x.service_files ?? {})[0] ?? '');
    });
  }, [nodeId]);

  if (!nodeId) return null;
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'overview', label: 'How it works', show: !!d?.blueprint },
    { id: 'source', label: 'Source', show: !!d?.service_files && Object.keys(d.service_files).length > 0 },
    { id: 'spec', label: 'Spec', show: !!d?.spec },
    { id: 'api', label: 'Handler', show: d?.node.type === 'api' },
  ];

  return (
    <aside className="absolute bottom-0 right-0 top-0 z-30 flex w-[520px] max-w-full flex-col border-l border-ink bg-panel shadow-[-8px_0_24px_rgba(23,32,44,0.12)]">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="eyebrow">{d?.node.type ?? 'Loading'}</div>
          <h2 className="font-display text-[20px] font-semibold leading-tight">{d ? nodeHeading(d.node) : '…'}</h2>
          {d?.node.label && d.node.type === 'document' && <p className="text-[13px] text-muted">{d.node.label}</p>}
        </div>
        <button aria-label="Close details" onClick={onClose} className="rounded p-1.5 text-muted hover:bg-sunken hover:text-ink">
          <X size={18} />
        </button>
      </div>
      {d && d.drift_alerts.filter((a) => a.status === 'open').length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-line bg-drift-soft px-5 py-2 text-[12.5px]">
          {d.drift_alerts.filter((a) => a.status === 'open').length} open drift alert(s)
          <button className="text-accent underline" onClick={() => onOpenDrift(d.drift_alerts[0].id)}>Open in drift inbox</button>
        </div>
      )}
      <div role="tablist" className="flex gap-4 border-b border-line px-5 text-[13px]">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 py-2.5 ${tab === t.id ? 'border-ink font-semibold' : 'border-transparent text-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 text-[13px]">
        {!d && <Spinner label="Loading" />}
        {d && tab === 'overview' && d.blueprint && (
          <div className="flex flex-col gap-4">
            <p>{d.blueprint.mission}</p>
            <div className="flex flex-wrap gap-1.5">
              {d.blueprint.tech_stack.map((t) => <span key={t} className="chip bg-sunken text-ink-soft">{t}</span>)}
            </div>
            <section>
              <h3 className="eyebrow mb-2">Request pipeline</h3>
              <ol className="flex flex-col gap-2">
                {d.blueprint.execution_pipeline.map((s) => (
                  <li key={s.step_number} className="grid grid-cols-[24px_1fr] gap-2 rounded-md border border-line p-2.5">
                    <span className="font-mono text-muted">{s.step_number}</span>
                    <span><span className="font-medium">{s.title}</span><span className="block text-muted">{s.description}</span></span>
                  </li>
                ))}
              </ol>
            </section>
            {d.blueprint.models.length > 0 && (
              <section>
                <h3 className="eyebrow mb-2">Data models</h3>
                {d.blueprint.models.map((m) => (
                  <div key={m.name} className="mb-2 rounded-md border border-line">
                    <div className="border-b border-line bg-sunken px-2.5 py-1 font-mono text-[12px] font-medium">{m.name}</div>
                    {m.fields.map((f) => (
                      <div key={f.name} className="flex justify-between px-2.5 py-0.5 font-mono text-[12px]">
                        <span>{f.name}</span>
                        <span className="text-muted">{f.type_annotation}{f.is_required ? '' : ' (optional)'}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
        {d && tab === 'source' && d.service_files && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {Object.keys(d.service_files).map((f) => (
                <button key={f} onClick={() => setFile(f)} className={`rounded-md px-2 py-1 font-mono text-[12px] ${file === f ? 'bg-ink text-white' : 'bg-sunken'}`}>{f}</button>
              ))}
            </div>
            <pre className="codebox overflow-x-auto whitespace-pre text-[11.5px]">{d.service_files[file]}</pre>
          </div>
        )}
        {d && tab === 'spec' && d.spec && (
          <div className="flex flex-col gap-4">
            <p className="text-muted">Owner: <span className="text-ink">{d.spec.owning_team}</span>{d.spec.collaborating_team ? ` · with ${d.spec.collaborating_team}` : ''}</p>
            {d.spec.objective && <section><h3 className="eyebrow mb-1">Objective</h3><p>{tidy(d.spec.objective)}</p></section>}
            {d.spec.scope_in.length > 0 && <List title="In scope" items={d.spec.scope_in} />}
            {d.spec.scope_out.length > 0 && <List title="Out of scope" items={d.spec.scope_out} />}
            {d.spec.success_criteria.length > 0 && <List title="Success criteria" items={d.spec.success_criteria} />}
            <button className="self-start text-accent underline" onClick={() => setRaw(!raw)}>{raw ? 'Hide markdown' : 'Show full markdown'}</button>
            {raw && <pre className="codebox text-[11.5px]">{d.spec.raw_markdown}</pre>}
          </div>
        )}
        {d && tab === 'api' && (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-[130px_1fr] gap-y-1">
              <dt className="text-muted">Service</dt><dd className="font-mono">{d.node.service_id}</dd>
              {d.node.properties.handler && <><dt className="text-muted">Handler</dt><dd className="font-mono">{d.node.properties.handler}()</dd></>}
              {d.node.properties.status_code && <><dt className="text-muted">Status</dt><dd className="font-mono">{d.node.properties.status_code}</dd></>}
              {d.node.properties.is_async !== undefined && <><dt className="text-muted">Mode</dt><dd>{d.node.properties.is_async ? 'Asynchronous' : 'Synchronous'}</dd></>}
              {d.node.properties.event_topic && <><dt className="text-muted">Event</dt><dd className="font-mono">{d.node.properties.event_topic}</dd></>}
            </dl>
            {d.code_snippet && <pre className="codebox overflow-x-auto whitespace-pre text-[11.5px]">{d.code_snippet}</pre>}
          </div>
        )}
      </div>
    </aside>
  );
}

// The markdown parser leaves some markup behind ("**", "---", empty bullets); tidy it for display.
const tidy = (s: string) => s.replace(/\*\*/g, '').replace(/\s*-{3,}\s*$/, '').trim();

function List({ title, items }: { title: string; items: string[] }) {
  items = items.map(tidy).filter(Boolean);
  return (
    <section>
      <h3 className="eyebrow mb-1">{title}</h3>
      <ul className="list-disc space-y-0.5 pl-5">{items.map((s) => <li key={s}>{s}</li>)}</ul>
    </section>
  );
}
