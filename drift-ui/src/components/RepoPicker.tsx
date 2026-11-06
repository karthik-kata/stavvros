import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FolderGit2, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { RepoInfo } from '../types';
import { Spinner, ago } from './ui';

/** Top-bar repository switcher: pick which codebase to watch, add a folder or git URL, or remove one. */
export function RepoPicker({ repos, current, onSelect, onChanged }: {
  repos: RepoInfo[];
  current: RepoInfo | null;
  onSelect: (id: string) => void;
  onChanged: (selectId?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const repo = await api.addRepo(location);
      setLocation(''); setAdding(false); setOpen(false);
      onChanged(repo.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: RepoInfo) => {
    if (!window.confirm(`Stop watching “${r.name}”? Your decisions for it are deleted. ${r.source === 'path' ? 'The folder itself is not touched.' : 'The local clone is deleted.'}`)) return;
    try { await api.removeRepo(r.id); onChanged(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="listbox"
        className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-left hover:bg-sunken">
        <FolderGit2 size={15} className="text-muted" />
        <span className="leading-tight">
          <span className="block text-[13px] font-medium">{current?.name ?? 'Choose a repository'}</span>
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 top-11 z-40 w-[380px] rounded-xl border border-ink bg-panel p-2 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          <div className="eyebrow px-2 pb-1 pt-1.5">Repositories</div>
          <ul role="listbox">
            {repos.map((r) => (
              <li key={r.id} className="group flex items-center rounded-md hover:bg-sunken">
                <button role="option" aria-selected={r.id === current?.id} onClick={() => { onSelect(r.id); setOpen(false); }}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left">
                  <Check size={14} className={r.id === current?.id ? 'text-accent' : 'invisible'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{r.name}{r.demo && <span className="chip ml-2 bg-sunken text-muted">DEMO</span>}</span>
                    <span className="block truncate font-mono text-[11px] text-muted">{r.location}</span>
                  </span>
                  <span className="shrink-0 text-right text-[11.5px] text-muted">
                    {r.open_drifts != null ? `${r.open_drifts} to decide` : 'Not scanned'}
                    {r.last_scanned && <span className="block">{ago(r.last_scanned)}</span>}
                  </span>
                </button>
                {!r.demo && (
                  <button aria-label={`Remove ${r.name}`} title="Stop watching" onClick={() => remove(r)}
                    className="mr-1 rounded p-1.5 text-muted opacity-0 hover:text-crit focus:opacity-100 group-hover:opacity-100"><Trash2 size={14} /></button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            {!adding ? (
              <button onClick={() => setAdding(true)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[13px] text-muted hover:bg-sunken hover:text-ink">
                <Plus size={14} />Add repository
              </button>
            ) : (
              <form onSubmit={add} className="flex flex-col gap-2 p-2">
                <label className="text-[12px] text-muted" htmlFor="repo-location">Folder on this machine, or a git URL</label>
                <input id="repo-location" autoFocus value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="~/Code/my-service  or  https://github.com/org/repo.git"
                  className="rounded-md border border-line bg-sunken px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none placeholder:text-muted focus:border-accent" />
                {error && <p className="text-[12px] text-crit">{error}</p>}
                <div className="flex items-center gap-2">
                  <button className="btn btn-primary" disabled={busy || !location.trim()}>{busy ? <Spinner label="Adding" /> : 'Add and scan'}</button>
                  <button type="button" className="btn btn-ghost" onClick={() => { setAdding(false); setError(null); }}>Cancel</button>
                </div>
              </form>
            )}
            {!adding && error && <p className="px-2 pb-2 text-[12px] text-crit">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
