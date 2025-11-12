import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SidePanelState {
  isOpen: boolean;
  currentComponent: string | null; // 当前显示的组件名称，默认为 'ai'
}

const initialState: SidePanelState = {
  isOpen: false,
  currentComponent: 'ai', // 默认显示 AI 组件
};

const sidePanelSlice = createSlice({
  name: 'sidePanel',
  initialState,
  reducers: {
    toggleSidePanel: (state) => {
      state.isOpen = !state.isOpen;
    },
    openSidePanel: (state) => {
      state.isOpen = true;
    },
    closeSidePanel: (state) => {
      state.isOpen = false;
    },
    setCurrentComponent: (state, action: PayloadAction<string | null>) => {
      state.currentComponent = action.payload;
    },
  },
});

export const { toggleSidePanel, openSidePanel, closeSidePanel, setCurrentComponent } =
  sidePanelSlice.actions;
export default sidePanelSlice.reducer;

