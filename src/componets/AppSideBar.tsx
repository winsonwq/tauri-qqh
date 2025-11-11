import { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { setCurrentFeature, setCurrentPage } from '../redux/slices/featureKeysSlice';
import { toggleTheme } from '../redux/slices/themeSlice';
import { menuConfig, MenuItem } from '../config/menuConfig';
import { FaMoon, FaSun, FaRobot } from 'react-icons/fa';

interface AppSideBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const AppSideBar = ({ onToggleSidebar }: AppSideBarProps) => {
  const dispatch = useAppDispatch();
  const { currentFeature, currentPage } = useAppSelector((state) => state.featureKeys);
  const { theme } = useAppSelector((state) => state.theme);
  
  // 跟踪展开的父节点（使用 Set 来避免重复）
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // 当激活的页面改变时，自动展开包含该页面的父节点
  useEffect(() => {
    setExpandedParents((prev) => {
      const newExpanded = new Set<string>(prev);
      
      menuConfig.forEach((item) => {
        if (item.children && item.children.length > 0) {
          // 检查是否有子节点被激活
          const hasActiveChild = item.children.some(child => {
            if (child.page) {
              return currentFeature === child.feature && currentPage === child.page;
            }
            return currentFeature === child.feature && !currentPage;
          });
          
          if (hasActiveChild) {
            // 如果有激活的子节点，确保父节点展开
            newExpanded.add(item.key);
          }
        }
      });
      
      return newExpanded;
    });
  }, [currentFeature, currentPage]);

  const handleMenuClick = (item: MenuItem) => {
    // 只有叶节点（没有子菜单的节点）才响应打开页面
    if (item.children && item.children.length > 0) {
      // 父节点不响应，只让 details 元素处理展开/收起
      return;
    }
    
    // 叶节点：如果有 page，设置 feature 和 page
    if (item.page) {
      dispatch(setCurrentPage({ feature: item.feature, page: item.page }));
    } else {
      // 如果没有 page，只设置 feature
      dispatch(setCurrentFeature(item.feature));
    }
  };

  const handleParentToggle = (itemKey: string, isOpen: boolean) => {
    setExpandedParents((prev) => {
      const newSet = new Set(prev);
      if (isOpen) {
        newSet.add(itemKey);
      } else {
        newSet.delete(itemKey);
      }
      return newSet;
    });
  };

  const isActive = (item: MenuItem): boolean => {
    // 首先检查 feature 是否匹配
    if (currentFeature !== item.feature) {
      return false;
    }
    
    // 如果菜单项有 page 属性
    if (item.page) {
      // 需要精确匹配 page（不包括动态路由）
      return currentPage === item.page;
    }
    
    // 如果菜单项没有 page 属性（如首页）
    // 只要 feature 匹配就认为是 active
    // 这样可以确保在首页的子页面（如资源详情页）时，首页菜单项仍然保持选中状态
    // 注意：即使 currentPage 是动态路由（如 'resource:xxx'），也应该返回 true
    return true;
  };

  const renderMenuItem = (item: MenuItem) => {
    const hasChildren = item.children && item.children.length > 0;
    const active = isActive(item);

    const IconComponent = item.icon;

    if (hasChildren) {
      // 判断是否应该展开：如果当前激活的子节点在这个父节点下，或者用户手动展开了
      const shouldBeOpen = expandedParents.has(item.key);
      
      return (
        <li key={item.key}>
          <details 
            open={shouldBeOpen}
            onToggle={(e) => {
              // 阻止事件冒泡，避免影响其他 details
              e.stopPropagation();
              const target = e.currentTarget as HTMLDetailsElement;
              handleParentToggle(item.key, target.open);
            }}
          >
            <summary
              onClick={(e) => {
                // 阻止事件冒泡
                e.stopPropagation();
              }}
            >
              {IconComponent && <IconComponent className="h-3.5 w-3.5" />}
              {item.label}
            </summary>
            <ul>
              {item.children?.map((child) => {
                const ChildIconComponent = child.icon;
                const childActive = isActive(child);
                const childLinkClassName = childActive ? 'menu-active' : '';
                return (
                  <li key={child.key}>
                    <button
                      className={childLinkClassName || undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuClick(child);
                      }}
                    >
                      {ChildIconComponent && <ChildIconComponent className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        </li>
      );
    }

    // 构建类名，确保 menu-active 类正确应用（按照 DaisyUI 规范）
    const linkClassName = active ? 'menu-active' : '';
    
    return (
      <li key={item.key}>
        <button
          className={linkClassName || undefined}
          onClick={() => handleMenuClick(item)}
        >
          {IconComponent && <IconComponent className="h-3.5 w-3.5" />}
          {item.label}
        </button>
      </li>
    );
  };

  return (
    <div className="drawer-side">
      <label
        htmlFor="sidebar-toggle"
        className="drawer-overlay"
        onClick={onToggleSidebar}
      ></label>
      <aside className="w-64 h-full bg-base-200 relative overflow-y-auto border-r border-base-300">
        {/* Logo 区域 */}
        <div className="flex items-center justify-start h-20 border-b border-base-300 px-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-xl font-bold text-black leading-tight">Echo</span>
            </div>
          </div>
        </div>

        {/* Menu 区域 */}
        <ul className="menu p-4 w-full space-y-2">
          {menuConfig.map((item) => renderMenuItem(item))}
        </ul>

        {/* Theme Toggle Button */}
        <div className="absolute bottom-4 left-4 right-4">
          <button
            className="btn btn-block btn-ghost"
            onClick={() => dispatch(toggleTheme())}
            aria-label="切换主题"
          >
            {theme === 'dark' ? (
              <>
                <FaSun className="h-3.5 w-3.5" />
                <span>浅色模式</span>
              </>
            ) : (
              <>
                <FaMoon className="h-3.5 w-3.5" />
                <span>深色模式</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </div>
  );
};

export default AppSideBar;

