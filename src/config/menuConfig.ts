import { IconType } from 'react-icons';

export interface MenuItem {
  key: string;
  label: string;
  icon?: IconType;
  feature: string;
  page?: string;
  children?: MenuItem[];
}

export interface FeaturePageMap {
  [feature: string]: {
    [page: string]: React.ComponentType | ((resourceId: string) => React.ComponentType);
  };
}

import { FaHome, FaCog } from 'react-icons/fa';

// Menu 配置
export const menuConfig: MenuItem[] = [
  {
    key: 'home',
    label: '首页',
    icon: FaHome,
    feature: 'home',
  },
  {
    key: 'settings',
    label: '设置',
    icon: FaCog,
    feature: 'settings',
    page: 'general',
  },
];

