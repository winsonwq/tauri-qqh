import { configureStore } from '@reduxjs/toolkit';
import featureKeysReducer from './slices/featureKeysSlice';
import themeReducer from './slices/themeSlice';
import transcriptionLogsReducer from './slices/transcriptionLogsSlice';
import videoExtractionReducer from './slices/videoExtractionSlice';
import sidePanelReducer from './slices/sidePanelSlice';
import mcpReducer from './slices/mcpSlice';
import aiConfigReducer from './slices/aiConfigSlice';

export const store = configureStore({
  reducer: {
    featureKeys: featureKeysReducer,
    theme: themeReducer,
    transcriptionLogs: transcriptionLogsReducer,
    videoExtraction: videoExtractionReducer,
    sidePanel: sidePanelReducer,
    mcp: mcpReducer,
    aiConfig: aiConfigReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

