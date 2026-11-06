import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Code2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  Boxes,
  Workflow,
  Database,
  FileCode,
  Copy,
  Check,
} from 'lucide-react';
import { NodeDetailsResponse } from '../types';
import { fetchNodeDetails, reconcileDriftAlert } from '../api';

interface NodeInspectorProps {
  nodeId: string | null;
  onClose: () => void;
  onDriftReconciled: () => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  nodeId,
  onClose,
  onDriftReconciled,
}) => {
  const [details, setDetails] = useState<NodeDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'blueprint' | 'spec' | 'code' | 'files' | 'drift'>('blueprint');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);

  useEffect(() => {
    if (!nodeId) {
      setDetails(null);
      return;
    }
    setLoading(true);
    fetchNodeDetails(nodeId)
      .then((data) => {
        setDetails(data);
        if (data.node.status === 'drift' || data.drift_alerts.length > 0) {
          setActiveTab('drift');
        } else if (data.blueprint) {
          setActiveTab('blueprint');
        } else if (data.spec) {
          setActiveTab('spec');
        } else {
          setActiveTab('code');
        }

        if (data.service_files && Object.keys(data.service_files).length > 0) {
          setSelectedFile(Object.keys(data.service_files)[0]);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [nodeId]);

  if (!nodeId) return null;

  const handleReconcile = async (alertId: string) => {
    setReconcilingId(alertId);
    try {
      await reconcileDriftAlert(alertId);
      onDriftReconciled();
      if (nodeId) {
        const updated = await fetchNodeDetails(nodeId);
        setDetails(updated);
      }
    } catch {
      alert('Failed to reconcile drift');
    } finally {
      setReconcilingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed top-0 right-0 bottom-0 w-[560px] max-w-full bg-slate-900 border-l border-slate-800 z-40 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      {/* Drawer Header */}
      <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-900/95">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                details?.node.type === 'team'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : details?.node.type === 'service'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : details?.node.type === 'document'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {details?.node.type}
            </span>

            {details?.node.subtitle && (
              <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
                {details.node.subtitle}
              </span>
            )}

            {details?.node.status === 'drift' && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" /> Drift Detected
              </span>
            )}
          </div>
          <h2 className="text-base font-bold text-white tracking-tight leading-snug">
            {details?.node.label || 'Loading...'}
          </h2>
          {details?.node.file_path && (
            <p className="text-xs text-slate-400 truncate max-w-[440px] mt-0.5 font-mono">
              {details.node.file_path}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 text-xs font-medium overflow-x-auto">
        {details?.blueprint && (
          <button
            onClick={() => setActiveTab('blueprint')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'blueprint'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Service Blueprint</span>
          </button>
        )}

        {details?.service_files && Object.keys(details.service_files).length > 0 && (
          <button
            onClick={() => setActiveTab('files')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'files'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Source Code ({Object.keys(details.service_files).length})</span>
          </button>
        )}

        {details?.spec && (
          <button
            onClick={() => setActiveTab('spec')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'spec'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>FleetHD PRD Spec</span>
          </button>
        )}

        {(!details?.blueprint || details?.code_snippet) && (
          <button
            onClick={() => setActiveTab('code')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'code'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>AST & Handler</span>
          </button>
        )}

        {details?.drift_alerts && details.drift_alerts.length > 0 && (
          <button
            onClick={() => setActiveTab('drift')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'drift'
                ? 'border-red-500 text-red-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-red-400'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span>Drift Diff ({details.drift_alerts.length})</span>
          </button>
        )}
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-5 text-slate-300 text-xs leading-relaxed space-y-4">
        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading entity details...</div>
        ) : activeTab === 'blueprint' && details?.blueprint ? (
          /* ================= SERVICE BLUEPRINT VIEW ================= */
          <div className="space-y-5">
            {/* Mission Statement */}
            <div className="bg-gradient-to-r from-sky-950/40 to-slate-950 p-4 rounded-xl border border-sky-500/30 space-y-2">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-[11px] tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Service Mission & Responsibility</span>
              </div>
              <p className="text-slate-200 text-xs leading-normal">
                {details.blueprint.mission}
              </p>
              {/* Tech Stack Chips */}
              <div className="pt-2 flex flex-wrap gap-1.5">
                {details.blueprint.tech_stack.map((tech, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-full bg-sky-950/70 border border-sky-500/40 text-sky-300 font-mono text-[10px]"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            {/* Request Execution Pipeline */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Workflow className="w-4 h-4 text-sky-400" />
                <h3 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                  Request Execution Flow Pipeline
                </h3>
              </div>
              <div className="space-y-2 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-800 before:z-0">
                {details.blueprint.execution_pipeline.map((step) => (
                  <div
                    key={step.step_number}
                    className="relative z-10 flex items-start gap-3 bg-slate-950/80 p-3 rounded-lg border border-slate-800 hover:border-sky-500/40 transition"
                  >
                    <div className="w-7 h-7 rounded-full bg-sky-950 border border-sky-500 text-sky-300 flex items-center justify-center font-bold text-xs shrink-0">
                      {step.step_number}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-semibold text-slate-100 text-xs">{step.title}</h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {step.component}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Domain Schemas & Models */}
            {details.blueprint.models && details.blueprint.models.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                    Extracted Domain Models (Pydantic AST)
                  </h3>
                </div>
                <div className="space-y-3">
                  {details.blueprint.models.map((model) => (
                    <div
                      key={model.name}
                      className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden"
                    >
                      <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                        <span className="font-mono text-emerald-400 font-bold text-xs">
                          class {model.name}(BaseModel)
                        </span>
                        {model.docstring && (
                          <span className="text-[10px] text-slate-400 italic truncate max-w-[200px]">
                            {model.docstring}
                          </span>
                        )}
                      </div>
                      <div className="p-3 divide-y divide-slate-800/60 font-mono text-[11px]">
                        {model.fields.map((f) => (
                          <div key={f.name} className="py-1 flex items-center justify-between">
                            <span className="text-slate-300">{f.name}:</span>
                            <div className="flex items-center gap-2">
                              <span className="text-purple-400">{f.type_annotation}</span>
                              {f.is_required ? (
                                <span className="text-[9px] uppercase px-1 rounded bg-red-950/60 text-red-400 border border-red-500/30">
                                  req
                                </span>
                              ) : (
                                <span className="text-[9px] uppercase px-1 rounded bg-slate-800 text-slate-400">
                                  opt
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'files' && details?.service_files ? (
          /* ================= SOURCE CODE FILE BROWSER ================= */
          <div className="space-y-3">
            {/* File Switcher Tabs */}
            <div className="flex gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800 overflow-x-auto">
              {Object.keys(details.service_files).map((filename) => (
                <button
                  key={filename}
                  onClick={() => setSelectedFile(filename)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono transition flex items-center gap-1.5 ${
                    selectedFile === filename
                      ? 'bg-sky-600 text-white font-semibold shadow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>{filename}</span>
                </button>
              ))}
            </div>

            {/* Code Viewer */}
            {selectedFile && details.service_files[selectedFile] && (
              <div className="relative rounded-lg border border-slate-800 overflow-hidden bg-slate-950">
                <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-sky-400" />
                    {selectedFile}
                  </span>
                  <button
                    onClick={() => copyToClipboard(details.service_files![selectedFile])}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] text-slate-300 flex items-center gap-1 transition"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy File</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre leading-5 max-h-[550px]">
                  {details.service_files[selectedFile]}
                </pre>
              </div>
            )}
          </div>
        ) : activeTab === 'spec' && details?.spec ? (
          /* ================= FLEETHD PRD SPEC VIEW ================= */
          <div className="space-y-4">
            {/* Team metadata */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-slate-500 text-[11px]">Owning Team:</span>
                <p className="font-semibold text-slate-200">{details.spec.owning_team}</p>
              </div>
              {details.spec.collaborating_team && (
                <div className="text-right">
                  <span className="text-slate-500 text-[11px]">Collaborating:</span>
                  <p className="font-semibold text-slate-200">{details.spec.collaborating_team}</p>
                </div>
              )}
            </div>

            {/* Objective */}
            <div>
              <h3 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] mb-1">
                1. Objective
              </h3>
              <p className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300">
                {details.spec.objective}
              </p>
            </div>

            {/* Scope Boundaries */}
            <div>
              <h3 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] mb-1">
                2. Scope Boundaries (Prevents Agent Wandering)
              </h3>
              <div className="space-y-2">
                <div className="bg-emerald-950/20 border border-emerald-500/30 p-2.5 rounded-lg">
                  <span className="font-bold text-emerald-400 text-[11px] block mb-1">✔ In Scope</span>
                  <ul className="list-disc list-inside space-y-0.5 text-emerald-300/90 text-[11px]">
                    {details.spec.scope_in.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-red-950/20 border border-red-500/30 p-2.5 rounded-lg">
                  <span className="font-bold text-red-400 text-[11px] block mb-1">✖ Out of Scope</span>
                  <ul className="list-disc list-inside space-y-0.5 text-red-300/90 text-[11px]">
                    {details.spec.scope_out.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Success Criteria */}
            <div>
              <h3 className="font-bold text-slate-200 uppercase tracking-wider text-[11px] mb-1">
                3. Success Criteria
              </h3>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                {details.spec.success_criteria.map((c, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span className="text-slate-300">{c}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw Markdown Toggle */}
            <div className="pt-2">
              <button
                onClick={() => setShowRawMarkdown(!showRawMarkdown)}
                className="text-purple-400 hover:text-purple-300 text-[11px] font-semibold underline"
              >
                {showRawMarkdown ? 'Hide Raw Markdown' : 'View Full Raw Markdown (.md)'}
              </button>
              {showRawMarkdown && (
                <pre className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-400 overflow-x-auto whitespace-pre-wrap max-h-60">
                  {details.spec.raw_markdown}
                </pre>
              )}
            </div>
          </div>
        ) : activeTab === 'code' ? (
          /* ================= CODE / AST HANDLER VIEW ================= */
          <div className="space-y-4">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Service:</span>
                <span className="font-mono text-purple-400 font-bold">{details?.node.service_id || 'N/A'}</span>
              </div>
              {details?.node.properties?.handler && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Handler Function:</span>
                  <span className="font-mono text-emerald-400">{details.node.properties.handler}()</span>
                </div>
              )}
              {details?.node.properties?.status_code && (
                <div className="flex justify-between">
                  <span className="text-slate-500">HTTP Status:</span>
                  <span className="font-mono text-blue-400">{details.node.properties.status_code}</span>
                </div>
              )}
              {details?.node.properties?.is_async !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Execution Mode:</span>
                  <span className="font-mono text-amber-400">
                    {details.node.properties.is_async ? 'Asynchronous (Worker/Kafka)' : 'Synchronous REST'}
                  </span>
                </div>
              )}
            </div>

            {details?.code_snippet ? (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                    Source Code Snippet
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Line {details.node.properties?.line_number || 1}
                  </span>
                </div>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                  {details.code_snippet}
                </pre>
              </div>
            ) : (
              <p className="text-slate-500">Select an API route node to inspect its AST definition.</p>
            )}
          </div>
        ) : activeTab === 'drift' && details?.drift_alerts ? (
          /* ================= DRIFT DIFF VIEW ================= */
          <div className="space-y-5">
            {details.drift_alerts.map((alert) => (
              <div key={alert.id} className="bg-red-950/20 border border-red-500/40 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-red-400 font-bold text-xs">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{alert.title}</span>
                  </div>
                  <span className="text-[9px] uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 font-bold">
                    {alert.severity}
                  </span>
                </div>

                {/* Split-Screen Diff View */}
                <div className="grid grid-cols-1 gap-2 text-[11px]">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-red-500/30">
                    <span className="text-slate-500 text-[10px] block font-semibold mb-0.5">
                      📄 WHAT THE DOCUMENT SAYS (.md):
                    </span>
                    <p className="text-red-300 font-mono">{alert.doc_spec}</p>
                  </div>

                  <div className="bg-slate-950 p-2.5 rounded-lg border border-emerald-500/30">
                    <span className="text-slate-500 text-[10px] block font-semibold mb-0.5">
                      💻 WHAT THE CODE IMPLEMENTS (.py):
                    </span>
                    <p className="text-emerald-300 font-mono">{alert.code_reality}</p>
                  </div>
                </div>

                {alert.suggested_patch && (
                  <div className="bg-purple-950/30 border border-purple-500/30 p-2.5 rounded-lg text-[11px]">
                    <span className="text-purple-400 font-bold flex items-center gap-1 mb-0.5">
                      <Sparkles className="w-3 h-3" /> Recommended Fix:
                    </span>
                    <p className="text-slate-300">{alert.suggested_patch}</p>
                  </div>
                )}

                {/* Reconciliation Action Buttons */}
                <div className="pt-1 flex gap-2">
                  <button
                    onClick={() => handleReconcile(alert.id)}
                    disabled={reconcilingId === alert.id || alert.status === 'resolved'}
                    className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition flex items-center justify-center gap-1.5 shadow"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {alert.status === 'resolved'
                        ? 'Reconciled'
                        : reconcilingId === alert.id
                        ? 'Updating...'
                        : '1-Click Update Graph Link'}
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
