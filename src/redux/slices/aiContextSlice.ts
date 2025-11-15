import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AIContextState {
  currentResourceId: string | null;
  currentTaskId: string | null;
  lastUpdated: number | null;
}

const initialState: AIContextState = {
  currentResourceId: null,
  currentTaskId: null,
  lastUpdated: null,
};

const aiContextSlice = createSlice({
  name: 'aiContext',
  initialState,
  reducers: {
    setCurrentResourceId: (state, action: PayloadAction<string | null>) => {
      state.currentResourceId = action.payload;
      state.lastUpdated = Date.now();
    },
    setCurrentTaskId: (state, action: PayloadAction<string | null>) => {
      state.currentTaskId = action.payload;
      state.lastUpdated = Date.now();
    },
    setContext: (
      state,
      action: PayloadAction<{
        resourceId?: string | null;
        taskId?: string | null;
      }>
    ) => {
      if (action.payload.resourceId !== undefined) {
        state.currentResourceId = action.payload.resourceId;
      }
      if (action.payload.taskId !== undefined) {
        state.currentTaskId = action.payload.taskId;
      }
      state.lastUpdated = Date.now();
    },
    clearContext: (state) => {
      state.currentResourceId = null;
      state.currentTaskId = null;
      state.lastUpdated = Date.now();
    },
  },
});

export const {
  setCurrentResourceId,
  setCurrentTaskId,
  setContext,
  clearContext,
} = aiContextSlice.actions;
export default aiContextSlice.reducer;

