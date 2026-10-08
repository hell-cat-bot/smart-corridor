import { create } from 'zustand';
import gridData from '../data/mockGrid.json';

const useGridStore = create((set, get) => ({
  nodes: gridData.nodes,
  edges: gridData.edges,
  center: gridData.center,
  zoom: gridData.zoom,
  
  getNode: (id) => get().nodes.find(n => n.id === id),
  
  getNeighbors: (nodeId) => {
    const edges = get().edges;
    return edges
      .filter(e => e.from === nodeId || e.to === nodeId)
      .map(e => e.from === nodeId ? e.to : e.from);
  },
  
  blockNode: (nodeId) => set(state => ({
    nodes: state.nodes.map(n => n.id === nodeId ? { ...n, status: 'blocked' } : n)
  })),
  
  clearNode: (nodeId) => set(state => ({
    nodes: state.nodes.map(n => n.id === nodeId ? { ...n, status: 'normal', congestion: 0.1 } : n)
  })),
  
  updateNodeCongestion: (nodeId, congestion) => set(state => ({
    nodes: state.nodes.map(n => n.id === nodeId ? { ...n, congestion, status: congestion > 0.7 ? 'congested' : 'normal' } : n)
  })),
  
  resetGrid: () => set({ nodes: gridData.nodes, edges: gridData.edges }),
}));

export default useGridStore;
