import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ManagementKPIs } from './components/ManagementKPIs';
import { GraphCanvas } from './components/GraphCanvas';
import { NodeInspector } from './components/NodeInspector';
import { AddEdgeModal } from './components/AddEdgeModal';
import { fetchGraph, rebuildGraph } from './api';
import { GraphResponse } from './types';

export function App() {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isAddEdgeOpen, setIsAddEdgeOpen] = useState(false);

  const loadGraph = async () => {
    try {
      setLoading(true);
      const graphData = await fetchGraph();
      setData(graphData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraph();
  }, []);

  const handleRebuild = async () => {
    setIsRebuilding(true);
    try {
      const updated = await rebuildGraph();
      setData(updated);
    } catch (err) {
      alert('Failed to rebuild graph');
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleSelectDriftAlert = () => {
    if (data && data.drift_alerts.length > 0) {
      const alert = data.drift_alerts[0];
      const targetNode = data.nodes.find(
        (n) => n.id === alert.api_id || n.id === `doc-${alert.doc_id}`
      );
      if (targetNode) {
        setSelectedNodeId(targetNode.id);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col select-none">
      {/* 1. Global Navigation */}
      <Navbar
        onRebuild={handleRebuild}
        isRebuilding={isRebuilding}
        onOpenAddEdge={() => setIsAddEdgeOpen(true)}
      />

      {/* 2. Management KPI Overview Bar */}
      <ManagementKPIs
        data={data}
        onSelectDriftAlert={handleSelectDriftAlert}
      />

      {/* 3. Interactive Cytoscape Canvas */}
      <main className="flex-1 relative">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
            Building Stavvros Knowledge Graph from workspace...
          </div>
        ) : data ? (
          <GraphCanvas
            nodes={data.nodes}
            edges={data.edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => setSelectedNodeId(id)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-red-400 text-sm">
            Failed to connect to backend server on port 8000.
          </div>
        )}
      </main>

      {/* 4. Slide-out Node & FleetHD Doc Inspector */}
      <NodeInspector
        nodeId={selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
        onDriftReconciled={loadGraph}
      />

      {/* 5. Direct Relationship Editor Modal */}
      <AddEdgeModal
        isOpen={isAddEdgeOpen}
        onClose={() => setIsAddEdgeOpen(false)}
        nodes={data?.nodes || []}
        onEdgeCreated={loadGraph}
      />
    </div>
  );
}

export default App;
