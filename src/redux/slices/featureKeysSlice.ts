import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface FeatureKeysState {
  currentFeature: string | null;
  currentPage: string | null;
  breadcrumbs: Array<{ feature: string; page?: string }>;
}

const initialState: FeatureKeysState = {
  currentFeature: null,
  currentPage: null,
  breadcrumbs: [],
};

const featureKeysSlice = createSlice({
  name: 'featureKeys',
  initialState,
  reducers: {
    setCurrentFeature: (state, action: PayloadAction<string>) => {
      state.currentFeature = action.payload;
      state.currentPage = null;
      state.breadcrumbs = [{ feature: action.payload }];
    },
    setCurrentPage: (state, action: PayloadAction<{ feature: string; page: string | null }>) => {
      state.currentFeature = action.payload.feature;
      state.currentPage = action.payload.page;
      if (action.payload.page) {
        state.breadcrumbs = [
          { feature: action.payload.feature },
          { feature: action.payload.feature, page: action.payload.page },
        ];
      } else {
        state.breadcrumbs = [{ feature: action.payload.feature }];
      }
    },
    resetFeatureKeys: (state) => {
      state.currentFeature = null;
      state.currentPage = null;
      state.breadcrumbs = [];
    },
  },
});

export const { setCurrentFeature, setCurrentPage, resetFeatureKeys } = featureKeysSlice.actions;
export default featureKeysSlice.reducer;

