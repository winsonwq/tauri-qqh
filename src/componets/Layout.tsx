import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setCurrentFeature } from "../redux/slices/featureKeysSlice";
import { toggleSidePanel } from "../redux/slices/sidePanelSlice";
import { loadMCPConfigs } from "../redux/slices/mcpSlice";
import { loadAIConfigs } from "../redux/slices/aiConfigSlice";
import AppSideBar from "./AppSideBar";
import AppContent from "./AppContent";
import SidePanel from "./SidePanel";
import { FaBars, FaCommentDots } from "react-icons/fa";

const Layout = () => {
  const dispatch = useAppDispatch();
  const { currentFeature } = useAppSelector((state) => state.featureKeys);
  const { isOpen: sidePanelOpen } = useAppSelector((state) => state.sidePanel);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 初始化时，如果当前没有选中的功能，默认设置为首页
  useEffect(() => {
    if (!currentFeature) {
      dispatch(setCurrentFeature('home'));
    }
  }, [currentFeature, dispatch]);

  // 应用启动时加载 MCP 配置和 AI 配置
  useEffect(() => {
    dispatch(loadMCPConfigs());
    dispatch(loadAIConfigs());
  }, [dispatch]);

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleToggleSidePanel = () => {
    dispatch(toggleSidePanel());
  };

  return (
    <div className="drawer lg:drawer-open h-full w-full relative">
      <input
        id="sidebar-toggle"
        type="checkbox"
        className="drawer-toggle"
        checked={sidebarOpen}
        onChange={(e) => setSidebarOpen(e.target.checked)}
      />
      <div className="drawer-content flex flex-col h-full w-full overflow-hidden">
        {/* 顶部导航栏 */}
        <div className="navbar bg-base-100 shadow-sm lg:hidden flex-shrink-0">
          <div className="flex-none">
            <label
              htmlFor="sidebar-toggle"
              className="btn btn-square btn-ghost drawer-button"
            >
              <FaBars className="w-3.5 h-3.5" />
            </label>
          </div>
          <div className="flex-1">
            <a className="btn btn-ghost text-xl">应用名称</a>
          </div>
        </div>

        {/* 主内容区域和右侧面板 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 主内容区域 */}
          <div className="flex-1 overflow-hidden">
            <AppContent />
          </div>
          
          {/* 右侧面板 */}
          <SidePanel />
        </div>
      </div>
      <AppSideBar sidebarOpen={sidebarOpen} onToggleSidebar={handleToggleSidebar} />
      
      {/* 右下角固定按钮 */}
      <button
        onClick={handleToggleSidePanel}
        className={`fixed bottom-4 z-50 btn btn-circle btn-primary shadow-lg transition-all ${
          sidePanelOpen ? 'right-[23.5rem]' : 'right-4'
        }`}
        title={sidePanelOpen ? '关闭侧边面板' : '打开侧边面板'}
      >
        <FaCommentDots className="w-5 h-5" />
      </button>
    </div>
  );
};

export default Layout;

