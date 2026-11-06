import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Where the divider rests. 1 = list only, 0 = detail only, in between = split. */
export type Frac = number;
export const LIST_ONLY = 1;
export const DETAIL_ONLY = 0;
export const DEFAULT_SPLIT = 0.32;

const HANDLE = 10;
const SNAP_EDGE = 150;       // px from either edge where the divider snaps to list-only / detail-only
const MIN_LIST = 300;        // narrowest useful list in split mode
const MIN_DETAIL = 420;      // narrowest useful detail in split mode

/**
 * Two panes with a draggable divider. Dragging to an edge collapses a pane (List / Focus);
 * releasing anywhere else rests in Split. Keyboard: Left/Right on the divider step through the three modes.
 */
export function SplitPane({ frac, onFrac, left, right }: {
  frac: Frac;
  onFrac: (f: Frac) => void;
  left: ReactNode;
  right: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [drag, setDrag] = useState<Frac | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const track = Math.max(1, width - HANDLE);
  const fromX = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left - HANDLE / 2) / track));
  };
  const snap = (f: Frac): Frac => {
    const px = f * track;
    if (px > track - SNAP_EDGE) return LIST_ONLY;
    if (px < SNAP_EDGE) return DETAIL_ONLY;
    return Math.min((track - MIN_DETAIL) / track, Math.max(MIN_LIST / track, f));
  };

  const shown = drag ?? frac;
  const dragging = drag !== null;
  const mode = frac >= LIST_ONLY ? 'list' : frac <= DETAIL_ONLY ? 'focus' : 'split';

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const order = ['focus', 'split', 'list'] as const;
    const next = order[Math.min(2, Math.max(0, order.indexOf(mode) + (e.key === 'ArrowRight' ? 1 : -1)))];
    onFrac(next === 'list' ? LIST_ONLY : next === 'focus' ? DETAIL_ONLY : DEFAULT_SPLIT);
  };

  return (
    <div ref={box} className={`flex h-full min-h-0 overflow-hidden ${dragging ? 'select-none' : ''}`}>
      <div className={`min-h-0 shrink-0 overflow-y-auto overflow-x-hidden ${dragging ? '' : 'transition-[width] duration-200'}`}
        style={{ width: shown * track }} aria-hidden={shown === 0}>
        {shown > 0 && left}
      </div>
      <div
        role="separator" aria-orientation="vertical" tabIndex={0}
        aria-label="Resize list and detail. Left and right arrows switch between detail only, split and list only"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown * 100)}
        onKeyDown={onKey}
        onDoubleClick={() => onFrac(mode === 'split' ? LIST_ONLY : DEFAULT_SPLIT)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(fromX(e.clientX)); }}
        onPointerMove={(e) => { if (dragging) setDrag(fromX(e.clientX)); }}
        onPointerUp={(e) => { if (!dragging) return; e.currentTarget.releasePointerCapture(e.pointerId); onFrac(snap(fromX(e.clientX))); setDrag(null); }}
        onPointerCancel={() => setDrag(null)}
        style={{ width: HANDLE }}
        className="group relative z-10 shrink-0 cursor-col-resize touch-none border-x border-line bg-canvas outline-none hover:bg-sunken focus-visible:bg-accent-soft"
      >
        <span className={`absolute left-1/2 top-1/2 h-10 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full group-hover:bg-muted ${dragging ? 'bg-accent' : 'bg-line'}`} />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden" aria-hidden={shown === 1}>
        <div className="h-full overflow-y-auto">{right}</div>
      </div>
    </div>
  );
}
