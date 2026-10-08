import { create } from 'zustand';

const useActivityLogStore = create((set) => ({
  entries: [
    { id: 'init-1', timestamp: new Date().toISOString(), type: 'info', message: 'System initialized', severity: 'info' },
  ],
  
  addEntry: (type, message, metadata = {}, severity = 'info') => set((state) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    return {
      entries: [
        { id, timestamp: new Date().toISOString(), type, message, metadata, severity },
        ...state.entries
      ]
    };
  }),
  
  clearLog: () => set({ entries: [] }),
}));

export default useActivityLogStore;
