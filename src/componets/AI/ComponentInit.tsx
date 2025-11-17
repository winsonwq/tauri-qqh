// Component 初始化文件
// 在这里注册所有的 Component 组件

import { componentRegistry } from './ComponentRegistry'
import ResourceInfo from './tool-components/ResourceInfo'
import TaskInfo from './tool-components/TaskInfo'
import ResourceList from './tool-components/ResourceList'

// 初始化并注册所有 Component
export function initComponents() {
  // 注册资源信息组件
  componentRegistry.register('resource-info', ResourceInfo)
  
  // 注册任务信息组件
  componentRegistry.register('task-info', TaskInfo)
  
  // 注册资源列表组件
  componentRegistry.register('resource-list', ResourceList)
  
  // 可以在这里继续注册其他组件
}

// 在模块加载时自动初始化
initComponents()

