import { useAppSelector } from '../redux/hooks';
import AIPanel from './AI/AIPanel';

// 组件映射表，可以根据 currentComponent 渲染不同的组件
const componentMap: Record<string, React.ComponentType> = {
  ai: AIPanel,
  // 可以在这里添加更多组件
};

const SidePanel = () => {
  const { isOpen, currentComponent } = useAppSelector((state) => state.sidePanel);

  if (!isOpen) {
    return null;
  }

  const Component = currentComponent ? componentMap[currentComponent] : null;

  return (
    <div className="w-90 h-full bg-base-100 border-l border-base-300 flex flex-col">
      {Component ? (
        <Component />
      ) : (
        <div className="flex items-center justify-center h-full text-base-content/60">
          <p>未找到组件: {currentComponent}</p>
        </div>
      )}
    </div>
  );
};

export default SidePanel;

