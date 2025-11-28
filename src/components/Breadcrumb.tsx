import { useAppSelector } from '../redux/hooks';
import { useAppDispatch } from '../redux/hooks';
import { setCurrentPage, setCurrentFeature } from '../redux/slices/featureKeysSlice';

const Breadcrumb = () => {
  const dispatch = useAppDispatch();
  const { breadcrumbs } = useAppSelector((state) => state.featureKeys);

  const handleBreadcrumbClick = (feature: string, page?: string) => {
    if (page) {
      dispatch(setCurrentPage({ feature, page }));
    } else {
      dispatch(setCurrentFeature(feature));
    }
  };

  // 如果没有面包屑，不显示
  if (breadcrumbs.length === 0) {
    return null;
  }

  // 获取显示文本
  const getDisplayText = (feature: string, page?: string) => {
    const featureMap: Record<string, string> = {
      home: '首页',
      statistics: '统计',
      settings: '设置',
    };

    if (page) {
      // 如果是资源详情页
      if (page.startsWith('resource:')) {
        return '资源详情';
      }
      const pageMap: Record<string, string> = {
        overview: '概览',
        detail: '详情',
        general: '通用',
        advanced: '高级',
      };
      return pageMap[page] || page;
    }

    return featureMap[feature] || feature;
  };

  return (
    <div className="breadcrumbs text-sm">
      <ul>
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const displayText = getDisplayText(crumb.feature, crumb.page);

          return (
            <li key={`${crumb.feature}-${crumb.page || 'default'}-${index}`}>
              {isLast ? (
                <span className="text-base-content/70">{displayText}</span>
              ) : (
                <button
                  className="text-primary hover:underline"
                  onClick={() => handleBreadcrumbClick(crumb.feature, crumb.page)}
                >
                  {displayText}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default Breadcrumb;

