import { create } from 'zustand';
import mockDisasters from '../data/mockDisasters.json';

const useDisasterStore = create((set, get) => ({
  disasters: mockDisasters,
  
  addDisaster: (disaster) => set((state) => ({
    disasters: [...state.disasters, { ...disaster, timestamp: new Date().toISOString() }]
  })),
  
  removeDisaster: (id) => set((state) => ({
    disasters: state.disasters.filter(d => d.id !== id)
  })),
  
  clearAllDisasters: () => set({ disasters: [] }),
  resetDisasters: () => set({ disasters: mockDisasters }),
  
  getDisaster: (id) => get().disasters.find(d => d.id === id),
  getActiveDisasters: () => get().disasters,
}));

export default useDisasterStore;
