import { FeaturePageMap } from './menuConfig';
import HomePage from '../pages/HomePage';
import ResourceDetailPage from '../pages/ResourceDetailPage/ResourceDetailPage';
import StatisticsOverviewPage from '../pages/StatisticsOverviewPage';
import StatisticsDetailPage from '../pages/StatisticsDetailPage';
import SettingsGeneralPage from '../pages/SettingsGeneralPage';
import SettingsAdvancedPage from '../pages/SettingsAdvancedPage';

// Feature 和 Page 的映射关系
export const featurePageMap: FeaturePageMap = {
  home: {
    default: HomePage,
    // 动态路由：resource:${resourceId} 会映射到 ResourceDetailPage
    getResourceDetail: (resourceId: string) => ResourceDetailPage,
  },
  statistics: {
    overview: StatisticsOverviewPage,
    detail: StatisticsDetailPage,
  },
  settings: {
    general: SettingsGeneralPage,
    advanced: SettingsAdvancedPage,
  },
};

