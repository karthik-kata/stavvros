import fixtures from './fixtures.json';
import { DEMO_NOW, EXTRAS, PEOPLE, CURRENT_USER } from './sampleData';
import { applyHunks, buildDriftItem, draftCodeIssue, draftDocFix, shortDocName } from '../../lib/driftBuilder';
import type { StavvrosApi } from '../types';
import type {
  AssistantContext,
  DriftDecision,
  DriftItem,
  EdgeType,
  GraphResponse,
  MemoryEdge,
  NodeDetailsResponse,
  WorkspaceInfo,
} from '../../types';

/**
 * In-memory backend for demos. Starts from a real snapshot of the FastAPI engine's output
 * (fixtures.json was produced by GET /api/graph and GET /api/nodes/{id} on stavvros-workspace)
 * and adds the drift workflow the backend does not have yet.
 */

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms + Math.random() * 120));

interface State {
  workspace: WorkspaceInfo;
  graph: GraphResponse;
  nodes: Record<string, NodeDetailsResponse>;
  drifts: Record<string, DriftItem>;
  clock: number; // minutes after DEMO_NOW, so timeline times move forward during a demo
}

function initialState(): State {
  const f = clone(fixtures) as unknown as Omit<State, 'drifts' | 'clock'>;
  const s: State = { ...f, drifts: {}, clock: 0 };
  for (const a of s.graph.drift_alerts) {
    s.drifts[a.id] = buildDriftItem(a, s.graph, (id) => s.nodes[id], PEOPLE, EXTRAS(a.id));
  }
  return s;
}

let S = initialState();

const now = () => {
  S.clock += 2;
  return new Date(new Date(DEMO_NOW).getTime() + S.clock * 60_000).toISOString();
};

function isActive(d: DriftItem) {
  return d.state === 'open' || d.state === 'fix_in_review' || d.state === 'issue_open';
}

function refreshGraphKpis() {
  const g = S.graph;
  g.drift_alerts = Object.values(S.drifts).map((d) => d.alert);
  g.active_drift_count = Object.values(S.drifts).filter(isActive).length;
  // Edges: an alert that closes turns its drift edge into a verified "specifies" edge (same as backend reconcile).
  g.edges = g.edges.map((e: MemoryEdge) => {
    if (e.relationship !== 'drift_flagged') return e;
    const d = S.drifts[e.properties?.alert_id];
    if (d && !isActive(d)) return { ...e, relationship: 'specifies' as const, properties: { ...e.properties, reconciled: true } };
    return e;
  });
}

function get(id: string): DriftItem {
  const d = S.drifts[id];
  if (!d) throw new Error(`Drift ${id} not found`);
  return d;
}

export const mockApi: StavvrosApi = {
  mode: 'mock',

  async getWorkspace() {
    await wait(80);
    return clone(S.workspace);
  },

  async getGraph() {
    await wait();
    refreshGraphKpis();
    return clone(S.graph);
  },

  async getNode(nodeId) {
    await wait(120);
    const n = S.nodes[nodeId];
    if (!n) throw new Error('Node not found');
    const out = clone(n);
    out.drift_alerts = Object.values(S.drifts)
      .filter((d) => d.alert.api_id === nodeId || `doc-${d.alert.doc_id}` === nodeId || `service-${d.alert.service_id}` === nodeId)
      .map((d) => d.alert);
    return out;
  },

  async rescan() {
    await wait(900);
    refreshGraphKpis();
    return clone(S.graph);
  },

  async createEdge(source, target, relationship: EdgeType, notes) {
    await wait();
    S.graph.edges.push({
      id: `edge-user-${source}-${target}-${Date.now()}`,
      source,
      target,
      relationship,
      confidence: 1,
      properties: { created_by: CURRENT_USER.name, notes },
    });
  },

  async listDrifts() {
    await wait();
    return clone(Object.values(S.drifts));
  },

  async decideDrift(id, decision: DriftDecision, reason?: string) {
    await wait(300);
    const d = get(id);
    d.decision = decision;
    d.decided_by = CURRENT_USER;
    const t = now();
    if (decision === 'code_correct') {
      const spec = d.alert.doc_id !== 'none' ? S.nodes[`doc-${d.alert.doc_id}`]?.spec : undefined;
      // Undocumented routes have no doc yet: propose adding them to the owning team's architecture doc.
      const target = spec ?? Object.values(S.nodes).find((n) => n.spec?.owning_team === d.code?.owner.team)?.spec
        ?? Object.values(S.nodes).find((n) => n.spec?.title.startsWith('Architecture'))?.spec;
      const reviewer = PEOPLE.docOwner(target?.owning_team ?? d.code?.owner.team ?? '');
      d.proposed_fix = draftDocFix(d, target?.raw_markdown, reviewer, target?.doc_path ?? 'docs/');
      d.timeline = [d.timeline[0], { at: t, label: `Triaged by ${CURRENT_USER.name}`, detail: 'Code is correct; the doc is behind' }];
    } else if (decision === 'doc_correct') {
      d.issue = draftCodeIssue(d);
      d.state = 'issue_open';
      d.timeline = [
        d.timeline[0],
        { at: t, label: `Triaged by ${CURRENT_USER.name}`, detail: 'Doc is correct; the code regressed' },
        { at: t, label: `Issue opened for ${d.issue.assignee_team}` },
        { at: t, label: 'Code fixed', detail: `Waiting on ${d.issue.assignee_team}`, pending: true },
      ];
    } else {
      d.state = 'dismissed';
      d.dismiss_reason = reason || 'No reason given';
      d.alert.status = 'dismissed';
      d.timeline = [d.timeline[0], { at: t, label: `Dismissed by ${CURRENT_USER.name}`, detail: d.dismiss_reason }];
    }
    refreshGraphKpis();
    return clone(d);
  },

  async sendDocFix(id, editedLines) {
    await wait(350);
    const d = get(id);
    if (!d.proposed_fix) throw new Error('Choose "Code is correct" first');
    if (editedLines) {
      d.proposed_fix.hunks = d.proposed_fix.hunks.map((h) => (editedLines[h.line] ? { ...h, add: editedLines[h.line] } : h));
    }
    d.state = 'fix_in_review';
    const t = now();
    d.timeline = [
      ...d.timeline.filter((e) => !e.pending),
      { at: t, label: `Doc fix sent to ${d.proposed_fix.reviewer.name}`, detail: `${d.proposed_fix.path}` },
      { at: t, label: 'Merged', detail: `Waiting on ${d.proposed_fix.reviewer.name}`, pending: true },
    ];
    refreshGraphKpis();
    return clone(d);
  },

  async simulateMerge(id) {
    await wait(400);
    const d = get(id);
    const t = now();
    if (d.proposed_fix) {
      const docNode = Object.values(S.nodes).find((n) => n.spec?.doc_path === d.proposed_fix!.path);
      if (docNode?.spec) docNode.spec.raw_markdown = applyHunks(docNode.spec.raw_markdown, d.proposed_fix.hunks);
    }
    d.state = 'resolved';
    d.alert.status = 'resolved';
    d.timeline = [
      ...d.timeline.filter((e) => !e.pending),
      { at: t, label: d.proposed_fix ? `Approved by ${d.proposed_fix.reviewer.name} and merged` : 'Code fix merged' },
    ];
    refreshGraphKpis();
    return clone(d);
  },

  async reopenDrift(id) {
    await wait(150);
    const fresh = initialState().drifts[id];
    const d = get(id);
    // Restore the original doc text if a fix had merged.
    if (d.proposed_fix && d.state === 'resolved') {
      const original = initialState().nodes;
      for (const [k, n] of Object.entries(original)) if (n.spec && S.nodes[k]?.spec) S.nodes[k].spec!.raw_markdown = n.spec.raw_markdown;
    }
    S.drifts[id] = fresh;
    refreshGraphKpis();
    return clone(fresh);
  },

  async queryContext(question) {
    await wait(600);
    return buildContext(question);
  },

  async reset() {
    S = initialState();
  },
};

/** A keyword-level stand-in for the MCP query tool: finds APIs and docs about the topic and attaches drift warnings. */
function buildContext(question: string): AssistantContext {
  const words = question.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const topics = words.map((w) => w.replace(/s$/, '')).filter((w) => !['button', 'page', 'order', 'history', 'with', 'into', 'from', 'that', 'this'].includes(w));
  const hits = (text: string) => topics.some((t) => text.toLowerCase().includes(t));

  const apis = S.graph.nodes.filter((n) => n.type === 'api' && hits(n.label));
  const docs = S.graph.nodes.filter((n) => n.type === 'document' && hits(S.nodes[n.id]?.spec?.raw_markdown ?? ''));
  const answer: string[] = [];
  for (const a of apis) {
    const p = a.properties ?? {};
    answer.push(
      `${a.service_id} exposes ${a.label}: HTTP ${p.status_code}${p.is_async ? ', asynchronous' : ''}${p.event_topic ? `, emits ${p.event_topic}` : ''}.`,
    );
  }
  const calls = S.graph.edges.filter((e) => e.relationship === 'calls' && apis.some((a) => `service-${a.service_id}` === e.target));
  for (const c of calls) {
    const from = c.source.replace('service-', '');
    const to = c.target.replace('service-', '');
    if (from !== to && from === 'checkout-service') answer.push(`${from} already calls ${to} through PaymentClient.invoke_refund().`);
  }
  const warnings = Object.values(S.drifts)
    .filter((d) => d.kind === 'endpoint_changed' || d.kind === 'protocol_changed')
    .filter((d) => d.state === 'open' || d.state === 'fix_in_review' || d.state === 'issue_open')
    .filter((d) => hits(d.doc_says.join(' ') + d.code_does.join(' ')))
    .map((d) => ({
      drift_id: d.alert.id,
      headline: `${shortDocName(d.alert.doc_id)} is out of date`,
      doc_says: d.doc_says.join('; '),
      code_does: d.code_does.join('; '),
      guidance:
        d.state === 'fix_in_review'
          ? `Follow the code. A doc fix is waiting on ${d.proposed_fix?.reviewer.name}.`
          : d.state === 'issue_open'
            ? 'The doc is correct and the code is being fixed. Ask the payments team before building on this endpoint.'
            : 'Follow the code. No one has confirmed which side is correct yet.',
    }));
  return {
    question,
    answer: answer.length ? answer : ['No services or docs in this workspace match that question.'],
    sources: [
      ...apis.map((a) => ({ label: `${a.label} (${a.service_id})`, path: a.file_path ?? '' })),
      ...docs.map((d) => ({ label: shortDocName(d.id.replace('doc-', '')), path: S.nodes[d.id]?.spec?.doc_path ?? '' })),
    ],
    drift_warnings: warnings,
  };
}
