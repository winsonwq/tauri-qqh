import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface TranscriptionLogsState {
  // 按 taskId 存储日志，每个任务的日志是一个字符串数组
  logs: Record<string, string[]>;
}

const initialState: TranscriptionLogsState = {
  logs: {},
};

const transcriptionLogsSlice = createSlice({
  name: 'transcriptionLogs',
  initialState,
  reducers: {
    // 追加日志到指定任务
    appendLog: (state, action: PayloadAction<{ taskId: string; log: string }>) => {
      const { taskId, log } = action.payload;
      if (!state.logs[taskId]) {
        state.logs[taskId] = [];
      }
      // 只有当 log 不为空时才追加（避免初始化时的空字符串）
      if (log.trim()) {
        state.logs[taskId].push(log);
      }
      // 如果 log 为空，至少确保数组已初始化（通过上面的 if 语句）
    },
    // 清空指定任务的日志
    clearLogs: (state, action: PayloadAction<string>) => {
      const taskId = action.payload;
      if (state.logs[taskId]) {
        delete state.logs[taskId];
      }
    },
    // 清空所有日志
    clearAllLogs: (state) => {
      state.logs = {};
    },
  },
});

export const { appendLog, clearLogs, clearAllLogs } = transcriptionLogsSlice.actions;
export default transcriptionLogsSlice.reducer;

