import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { invoke } from '@tauri-apps/api/core';
import { MCPServerInfo } from '../../models';

export interface MCPState {
  servers: MCPServerInfo[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

const initialState: MCPState = {
  servers: [],
  loading: false,
  error: null,
  lastUpdated: null,
};

// 异步加载 MCP 配置
export const loadMCPConfigs = createAsyncThunk(
  'mcp/loadConfigs',
  async (_, { rejectWithValue }) => {
    try {
      const serversList = await invoke<MCPServerInfo[]>('get_mcp_configs');
      return serversList;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载 MCP 配置失败';
      return rejectWithValue(errorMessage);
    }
  }
);

// 刷新 MCP 配置
export const refreshMCPConfigs = createAsyncThunk(
  'mcp/refreshConfigs',
  async (_, { rejectWithValue }) => {
    try {
      const serversList = await invoke<MCPServerInfo[]>('get_mcp_configs');
      return serversList;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '刷新 MCP 配置失败';
      return rejectWithValue(errorMessage);
    }
  }
);

const mcpSlice = createSlice({
  name: 'mcp',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setServers: (state, action: PayloadAction<MCPServerInfo[]>) => {
      state.servers = action.payload;
      state.lastUpdated = Date.now();
    },
  },
  extraReducers: (builder) => {
    builder
      // loadMCPConfigs
      .addCase(loadMCPConfigs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadMCPConfigs.fulfilled, (state, action) => {
        state.loading = false;
        state.servers = action.payload;
        state.lastUpdated = Date.now();
        state.error = null;
      })
      .addCase(loadMCPConfigs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // refreshMCPConfigs
      .addCase(refreshMCPConfigs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(refreshMCPConfigs.fulfilled, (state, action) => {
        state.loading = false;
        state.servers = action.payload;
        state.lastUpdated = Date.now();
        state.error = null;
      })
      .addCase(refreshMCPConfigs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearError, setServers } = mcpSlice.actions;
export default mcpSlice.reducer;

