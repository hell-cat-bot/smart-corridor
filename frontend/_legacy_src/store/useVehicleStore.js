import { create } from 'zustand';
import mockVehicles from '../data/mockVehicles.json';

const useVehicleStore = create((set, get) => ({
  vehicles: mockVehicles,
  routes: {},
  
  addVehicle: (vehicle) => set((state) => ({ vehicles: [...state.vehicles, vehicle] })),
  
  removeVehicle: (id) => set((state) => ({ vehicles: state.vehicles.filter(v => v.id !== id) })),
  
  updateVehiclePosition: (id, nodeId) => set((state) => ({
    vehicles: state.vehicles.map(v => v.id === id ? { ...v, currentNode: nodeId } : v)
  })),
  
  updateVehicleStatus: (id, status) => set((state) => ({
    vehicles: state.vehicles.map(v => v.id === id ? { ...v, status } : v)
  })),
  
  updateVehicleRoute: (id, path, originalPath = null) => set((state) => ({
    routes: { ...state.routes, [id]: { path, originalPath: originalPath || state.routes[id]?.originalPath || null } }
  })),
  
  setVehicleHeading: (id, heading) => set((state) => ({
    vehicles: state.vehicles.map(v => v.id === id ? { ...v, heading } : v)
  })),
  
  resetVehicles: () => set({ vehicles: mockVehicles, routes: {} }),
  
  getVehicle: (id) => get().vehicles.find(v => v.id === id),
  getVehiclesByType: (type) => get().vehicles.filter(v => v.type === type),
  getVehiclesByPriority: (priority) => get().vehicles.filter(v => v.priority === priority),
}));

export default useVehicleStore;
