import { configureStore } from '@reduxjs/toolkit';
import featureKeysReducer from './slices/featureKeysSlice';
import themeReducer from './slices/themeSlice';
import transcriptionLogsReducer from './slices/transcriptionLogsSlice';
import videoExtractionReducer from './slices/videoExtractionSlice';
import sidePanelReducer from './slices/sidePanelSlice';

export const store = configureStore({
  reducer: {
    featureKeys: featureKeysReducer,
    theme: themeReducer,
    transcriptionLogs: transcriptionLogsReducer,
    videoExtraction: videoExtractionReducer,
    sidePanel: sidePanelReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

