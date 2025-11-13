import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { invoke } from '@tauri-apps/api/core';
import { AIConfig } from '../../models';

export interface AIConfigState {
  configs: AIConfig[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

const initialState: AIConfigState = {
  configs: [],
  loading: false,
  error: null,
  lastUpdated: null,
};

// 异步加载 AI 配置
export const loadAIConfigs = createAsyncThunk(
  'aiConfig/loadConfigs',
  async (_, { rejectWithValue }) => {
    try {
      const configsList = await invoke<AIConfig[]>('get_ai_configs');
      return configsList;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载 AI 配置失败';
      return rejectWithValue(errorMessage);
    }
  }
);

// 刷新 AI 配置
export const refreshAIConfigs = createAsyncThunk(
  'aiConfig/refreshConfigs',
  async (_, { rejectWithValue }) => {
    try {
      const configsList = await invoke<AIConfig[]>('get_ai_configs');
      return configsList;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '刷新 AI 配置失败';
      return rejectWithValue(errorMessage);
    }
  }
);

const aiConfigSlice = createSlice({
  name: 'aiConfig',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setConfigs: (state, action: PayloadAction<AIConfig[]>) => {
      state.configs = action.payload;
      state.lastUpdated = Date.now();
    },
  },
  extraReducers: (builder) => {
    builder
      // loadAIConfigs
      .addCase(loadAIConfigs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadAIConfigs.fulfilled, (state, action) => {
        state.loading = false;
        state.configs = action.payload;
        state.lastUpdated = Date.now();
        state.error = null;
      })
      .addCase(loadAIConfigs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // refreshAIConfigs
      .addCase(refreshAIConfigs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(refreshAIConfigs.fulfilled, (state, action) => {
        state.loading = false;
        state.configs = action.payload;
        state.lastUpdated = Date.now();
        state.error = null;
      })
      .addCase(refreshAIConfigs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearError, setConfigs } = aiConfigSlice.actions;
export default aiConfigSlice.reducer;

