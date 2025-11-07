import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setCurrentFeature } from "../redux/slices/featureKeysSlice";
import AppSideBar from "./AppSideBar";
import AppContent from "./AppContent";
import { FaBars } from "react-icons/fa";

const Layout = () => {
  const dispatch = useAppDispatch();
  const { currentFeature } = useAppSelector((state) => state.featureKeys);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 初始化时，如果当前没有选中的功能，默认设置为首页
  useEffect(() => {
    if (!currentFeature) {
      dispatch(setCurrentFeature('home'));
    }
  }, [currentFeature, dispatch]);

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="drawer lg:drawer-open h-full w-full">
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

        {/* 主内容区域 */}
        <AppContent />
      </div>
      <AppSideBar sidebarOpen={sidebarOpen} onToggleSidebar={handleToggleSidebar} />
    </div>
  );
};

export default Layout;

