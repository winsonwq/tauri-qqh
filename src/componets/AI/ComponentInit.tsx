// Component 初始化文件
// 在这里注册所有的 Component 组件

import React from 'react'
import { componentRegistry, ComponentProps } from './ComponentRegistry'
import ResourceInfo from './tool-components/ResourceInfo'
import TaskInfo from './tool-components/TaskInfo'
import ResourceList from './tool-components/ResourceList'
import PlannerResponseDisplay from './agent-components/PlannerResponseDisplay'
import VerifierResponseDisplay from './agent-components/VerifierResponseDisplay'
import ExecutorResponseDisplay from './agent-components/ExecutorResponseDisplay'
import TodoList from './agent-components/TodoList'

// TodoList 适配器：将 ComponentProps 转换为 TodoList 的 props
const TodoListAdapter: React.FC<{ props: ComponentProps }> = ({ props }) => {
  return <TodoList todos={props.todos || []} title={props.title} />
}

// 初始化并注册所有 Component
export function initComponents() {
  // 注册资源信息组件
  componentRegistry.register('resource-info', ResourceInfo)
  
  // 注册任务信息组件
  componentRegistry.register('task-info', TaskInfo)
  
  // 注册资源列表组件
  componentRegistry.register('resource-list', ResourceList)
  
  // 注册 Agent 响应组件
  componentRegistry.register('planner-response', PlannerResponseDisplay)
  componentRegistry.register('verifier-response', VerifierResponseDisplay)
  componentRegistry.register('executor-response', ExecutorResponseDisplay)
  
  // 注册字段级组件
  componentRegistry.register('todo-list', TodoListAdapter)
  
  // 可以在这里继续注册其他组件
}

// 在模块加载时自动初始化
initComponents()

