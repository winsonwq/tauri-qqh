import { useAppSelector } from '../redux/hooks';
import { featurePageMap } from '../config/featurePageMap';

const AppContent = () => {
  const { currentFeature, currentPage } = useAppSelector((state) => state.featureKeys);

  // 根据 currentFeature 和 currentPage 渲染对应的页面
  const renderPage = () => {
    if (!currentFeature) {
      return (
        <div className="card">
          <div className="card-body">
            <h2 className="card-title">欢迎使用</h2>
            <p>请从侧边栏选择一个功能</p>
          </div>
        </div>
      );
    }

    const featurePages = featurePageMap[currentFeature];
    if (!featurePages) {
      return (
        <div className="card">
          <div className="card-body">
            <h2 className="card-title">页面未找到</h2>
            <p>功能 {currentFeature} 的页面配置不存在</p>
          </div>
        </div>
      );
    }

    // 如果有 currentPage，使用对应的页面组件
    // 如果没有 currentPage，使用 default 页面
    let PageComponent;
    
    if (currentPage) {
      // 检查是否是动态路由（resource:${resourceId}）
      if (currentPage.startsWith('resource:') && 'getResourceDetail' in featurePages) {
        const resourceId = currentPage.replace('resource:', '');
        const getResourceDetail = (featurePages as any).getResourceDetail;
        if (typeof getResourceDetail === 'function') {
          PageComponent = getResourceDetail(resourceId);
        }
      } else {
        PageComponent = featurePages[currentPage];
      }
    } else {
      PageComponent = featurePages.default;
    }

    if (!PageComponent) {
      return (
        <div className="card">
          <div className="card-body">
            <h2 className="card-title">页面未找到</h2>
            <p>
              功能 {currentFeature}
              {currentPage ? ` 的页面 ${currentPage}` : ''} 未配置
            </p>
          </div>
        </div>
      );
    }

    return <PageComponent />;
  };

  return (
    <main className={`flex-1 bg-base-100 overflow-auto`}>
      {renderPage()}
    </main>
  );
};

export default AppContent;

