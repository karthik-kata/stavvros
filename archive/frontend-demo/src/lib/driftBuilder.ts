import type {
  CodeIssue,
  DivergenceInfo,
  DocFixHunk,
  DriftAlert,
  DriftItem,
  DriftKind,
  GraphResponse,
  NodeDetailsResponse,
  Person,
  ProposedDocFix,
  SourceExcerpt,
} from '../types';

/**
 * Turns a raw DriftAlert from the engine into a DriftItem the UI can show:
 * excerpts from both sides, owners, callers and a drafted fix.
 * Shared by the mock and live API so both behave the same.
 */

export interface PeopleDirectory {
  /** Who answers for a team's docs (PRD author / doc owner). */
  docOwner(team: string): Person;
  /** Who answers for a team's code. */
  codeOwner(team: string): Person;
}

export interface Extras {
  diverged?: DivergenceInfo;
  ai_answers_7d?: number;
  detected_at?: string;
}

type NodeLookup = (id: string) => NodeDetailsResponse | undefined;

export const KIND_BY_RULE: Record<string, DriftKind> = {
  'DRIFT-001-VERSION': 'endpoint_changed',
  'DRIFT-002-PROTOCOL': 'protocol_changed',
  'DRIFT-003-PHANTOM': 'missing_in_code',
  'DRIFT-004-UNDOCUMENTED': 'undocumented',
};

export const HEADLINE: Record<DriftKind, string> = {
  endpoint_changed: 'Endpoint changed',
  protocol_changed: 'Sync vs async mismatch',
  missing_in_code: 'Documented route missing',
  undocumented: 'Undocumented route',
};

const docContractRe = /'(GET|POST|PUT|PATCH|DELETE) ([^']+)'/;
const codeImplRe = /Code (.+?):(\d+): implements '(\w+) ([^']+)' \(status: (\d+)\)/;
const codeDeclRe = /Declared at (.+?):(\d+)\./;

function excerpt(all: string[], line1: number, before: number, after: number) {
  const start = Math.max(1, line1 - before);
  const end = Math.min(all.length, line1 + after);
  return { start_line: start, lines: all.slice(start - 1, end) };
}

function findLine(all: string[], needle: string, from = 0): number {
  for (let i = from; i < all.length; i++) if (all[i].includes(needle)) return i + 1;
  return -1;
}

function serviceFile(node: NodeDetailsResponse | undefined, path: string): string[] | undefined {
  const files = node?.service_files;
  if (!files) return undefined;
  const name = path.split('/').pop()!;
  return files[name]?.split('\n');
}

function teamOfService(graph: GraphResponse, serviceId: string): string {
  const edge = graph.edges.find((e) => e.relationship === 'owns' && e.target === `service-${serviceId}`);
  const team = graph.nodes.find((n) => n.id === edge?.source);
  return team?.label ?? 'Unknown team';
}

function callersOf(graph: GraphResponse, serviceId: string, codePath?: string, lookup?: NodeLookup): string[] {
  const out: string[] = [];
  for (const e of graph.edges) {
    if (e.relationship === 'calls' && e.target === `service-${serviceId}`) {
      const caller = e.source.replace('service-', '');
      // Prefer a concrete file:line when the caller's source mentions the path.
      const files = lookup?.(e.source)?.service_files ?? {};
      let hit: string | undefined;
      if (codePath) {
        for (const [f, src] of Object.entries(files)) {
          const ln = src.split('\n').findIndex((l) => l.includes(codePath));
          if (ln >= 0) hit = `${caller} (${f}, line ${ln + 1})`;
        }
      }
      out.push(hit ?? caller);
    }
  }
  return out;
}

export function buildDriftItem(
  alert: DriftAlert,
  graph: GraphResponse,
  lookup: NodeLookup,
  people: PeopleDirectory,
  extras: Extras = {},
): DriftItem {
  const kind = KIND_BY_RULE[alert.rule_id] ?? 'endpoint_changed';
  const docNode = alert.doc_id !== 'none' ? lookup(`doc-${alert.doc_id}`) : undefined;
  const spec = docNode?.spec;
  const svcNode = lookup(`service-${alert.service_id}`);
  const apiNode = alert.api_id ? lookup(alert.api_id) : undefined;
  const codeTeam = teamOfService(graph, alert.service_id);

  // ---- Document side
  let doc: SourceExcerpt | undefined;
  let docMethodPath: [string, string] | undefined;
  const docMd = spec?.raw_markdown.split('\n') ?? [];
  const m = alert.doc_spec.match(docContractRe);
  if (m) docMethodPath = [m[1], m[2]];
  let docLine = -1;
  if (spec && docMethodPath) {
    docLine = findLine(docMd, docMethodPath[1]);
    if (docLine > 0) {
      const ex = excerpt(docMd, docLine, 1, kind === 'endpoint_changed' ? 2 : 1);
      doc = {
        path: spec.doc_path,
        highlight_line: docLine,
        ...ex,
        owner: people.docOwner(spec.owning_team),
        title: spec.title,
      };
    }
  }

  // ---- Code side
  let code: SourceExcerpt | undefined;
  let codeMethodPath: [string, string] | undefined;
  let codeStatus: number | undefined = apiNode?.node.properties?.status_code;
  const ci = alert.code_reality.match(codeImplRe);
  const cd = alert.code_reality.match(codeDeclRe);
  const codePath = ci?.[1] ?? cd?.[1];
  const codeLineNo = Number(ci?.[2] ?? cd?.[2] ?? 0);
  if (ci) {
    codeMethodPath = [ci[3], ci[4]];
    codeStatus = Number(ci[5]);
  } else if (apiNode) {
    const [meth, ...rest] = apiNode.node.label.split(' ');
    codeMethodPath = [meth, rest.join(' ')];
  }
  if (codePath && codeLineNo) {
    const src = serviceFile(svcNode, codePath);
    if (src) {
      // Engine reports the def line; show the decorator above it too.
      const ex = excerpt(src, codeLineNo, 1, 4);
      code = {
        path: codePath,
        highlight_line: Math.max(1, codeLineNo - 1),
        ...ex,
        owner: people.codeOwner(codeTeam),
        title: alert.service_id,
      };
    }
  }

  // ---- Condensed claims
  const docSays: string[] = [];
  const codeDoes: string[] = [];
  const protoLine = docLine > 0 ? findLine(docMd, 'Protocol', docLine - 1) : -1;
  const respLine = docLine > 0 ? findLine(docMd, 'Response', docLine - 1) : -1;
  if (docMethodPath) docSays.push(`${docMethodPath[0]} ${docMethodPath[1]}`);
  if (protoLine > 0 && protoLine - docLine < 4) docSays.push(clean(docMd[protoLine - 1]));
  if (respLine > 0 && respLine - docLine < 20) docSays.push(clean(docMd[respLine - 1]));

  const props = apiNode?.node.properties ?? {};
  if (codeMethodPath) codeDoes.push(`${codeMethodPath[0]} ${codeMethodPath[1]}`);
  if (codeStatus) codeDoes.push(`HTTP ${codeStatus}${codeStatus === 202 ? ' Accepted' : ''}${props.is_async ? ', asynchronous' : ''}`);
  if (props.event_topic) codeDoes.push(`Emits ${props.event_topic}`);
  const codeSrc = codePath ? serviceFile(svcNode, codePath) : undefined;
  const statusVal = codeSrc && codeLineNo ? codeSrc.slice(codeLineNo, codeLineNo + 14).join('\n').match(/"status":\s*"([A-Z_]+)"/)?.[1] : undefined;
  if (statusVal) codeDoes.push(`status: ${statusVal}`);

  if (kind === 'missing_in_code') codeDoes.splice(0, codeDoes.length, 'No route matches this exact path');
  if (kind === 'undocumented') docSays.push('No PRD or architecture doc mentions this route');

  // ---- Summary sentence
  const headline = HEADLINE[kind];
  let summary = '';
  if (kind === 'endpoint_changed')
    summary = `${spec?.title ? shortDocName(alert.doc_id) : 'The doc'} says ${docSays[0]}; ${alert.service_id} implements ${codeDoes[0]}.`;
  else if (kind === 'missing_in_code') summary = `${shortDocName(alert.doc_id)} documents ${docSays[0]}, but no service implements it.`;
  else if (kind === 'undocumented') summary = `${alert.service_id} exposes ${codeDoes[0]}, and no doc describes it.`;
  else summary = `${shortDocName(alert.doc_id)} promises a synchronous response; the code answers asynchronously.`;

  return {
    alert,
    kind,
    headline,
    summary,
    doc,
    code,
    doc_says: docSays,
    code_does: codeDoes,
    diverged: extras.diverged,
    callers: callersOf(graph, alert.service_id, codeMethodPath?.[1], lookup),
    ai_answers_7d: extras.ai_answers_7d ?? 0,
    detected_at: extras.detected_at ?? new Date().toISOString(),
    state: alert.status === 'resolved' ? 'resolved' : alert.status === 'dismissed' ? 'dismissed' : 'open',
    timeline: [
      {
        at: extras.diverged?.date ?? extras.detected_at ?? new Date().toISOString(),
        label: 'Detected',
        detail: extras.diverged ? `From commit ${extras.diverged.commit}` : `Rule ${alert.rule_id}`,
      },
    ],
  };
}

function clean(s: string) {
  return s.replace(/^[\s-]*/, '').replace(/\*\*/g, '').replace(/`/g, '').trim();
}

export function shortDocName(docId: string): string {
  if (docId === 'none') return 'No doc';
  const m = docId.match(/^PRD-(\d{4})-(.*)$/);
  if (m) return `PRD-${m[1]} ${m[2].replace(/-/g, ' ')}`;
  return docId.replace(/-/g, ' ');
}

/** Draft the doc change for "code is correct". Pure function of the item and the doc text. */
export function draftDocFix(item: DriftItem, docMarkdown: string | undefined, reviewer: Person, fallbackDocPath: string): ProposedDocFix {
  const md = docMarkdown?.split('\n') ?? [];
  const hunks: DocFixHunk[] = [];
  const notes: string[] = [];
  const docPath = item.doc?.path ?? fallbackDocPath;
  const [, oldPath] = (item.doc_says[0] ?? ' ').split(' ');
  const [, newPath] = (item.code_does[0] ?? ' ').split(' ');

  if (item.kind === 'endpoint_changed' && item.doc) {
    const l = item.doc.highlight_line;
    hunks.push({ line: l, remove: [md[l - 1]], add: [md[l - 1].replace(oldPath, newPath)] });
    const isAsync = item.code_does.some((c) => c.includes('asynchronous'));
    const proto = md.findIndex((x, i) => i >= l - 1 && i < l + 3 && /Protocol/.test(x));
    if (isAsync && proto >= 0 && /Synchronous/i.test(md[proto])) {
      const topic = item.code_does.find((c) => c.startsWith('Emits '))?.replace('Emits ', '');
      hunks.push({
        line: proto + 1,
        remove: [md[proto]],
        add: [md[proto].replace(/Synchronous REST HTTP 200 OK/i, `Asynchronous, HTTP 202 Accepted${topic ? `; result arrives on \`${topic}\`` : ''}`)],
      });
    }
    const resp = md.findIndex((x, i) => i >= l - 1 && /^\s*-\s*\*\*Response\*\*/.test(x));
    const statusVal = item.code_does.find((c) => c.startsWith('status: '))?.replace('status: ', '');
    if (isAsync && resp >= 0 && statusVal) {
      hunks.push({
        line: resp + 1,
        remove: [md[resp]],
        add: [`- **Response**: \`202 Accepted\` with \`refund_id\` and status \`${statusVal}\`; final state arrives by event.`],
      });
    }
    const latency = md.findIndex((x) => /response time/i.test(x));
    if (isAsync && latency >= 0) notes.push(`Also check line ${latency + 1}: "${clean(md[latency]).replace(/^\d+\.\s*/, '')}" was written for a synchronous call.`);
  } else if (item.kind === 'missing_in_code' && item.doc) {
    const l = item.doc.highlight_line;
    hunks.push({ line: l, remove: [md[l - 1]], add: [] });
    notes.push('Removes the route from the doc. Choose "Doc is correct" instead if the route should exist.');
  } else if (item.kind === 'undocumented') {
    const routesAt = md.findIndex((x) => /Exposed Routes/i.test(x));
    const line = routesAt >= 0 ? routesAt + 2 : Math.max(1, md.length);
    hunks.push({ line, remove: [], add: [`    - \`${item.code_does[0]}\`: <describe what this route does>`] });
    notes.push('Fill in the description before sending.');
  } else if (item.kind === 'protocol_changed' && item.doc) {
    const l = item.doc.highlight_line;
    hunks.push({ line: l, remove: [md[l - 1]], add: [md[l - 1] + ' (asynchronous, HTTP 202)'] });
  }
  return { path: docPath, hunks, notes, reviewer };
}

export function draftCodeIssue(item: DriftItem): CodeIssue {
  return {
    title: `${item.alert.service_id} does not match ${shortDocName(item.alert.doc_id)}: ${item.doc_says[0] ?? ''}`,
    assignee_team: item.code?.owner.team ?? 'Service owner',
    body: [
      `The doc is correct and the code has drifted from it.`,
      `Doc says: ${item.doc_says.join('; ')}`,
      `Code does: ${item.code_does.join('; ')}`,
      item.diverged ? `Diverged in ${item.diverged.commit} "${item.diverged.message}" (${item.diverged.author}).` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/** Apply hunks to markdown text (used by the mock when a fix merges). */
export function applyHunks(markdown: string, hunks: DocFixHunk[]): string {
  const md = markdown.split('\n');
  [...hunks]
    .sort((a, b) => b.line - a.line)
    .forEach((h) => md.splice(h.line - 1, h.remove.length, ...h.add));
  return md.join('\n');
}
