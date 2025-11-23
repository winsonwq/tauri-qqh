import React from 'react'

// Component 属性类型
export type ComponentProps = Record<string, any>

// Component 组件类型
export type ToolComponent = React.ComponentType<{ props: ComponentProps }>

// Component 注册表
class ComponentRegistry {
  private components: Map<string, ToolComponent> = new Map()

  // 注册组件
  register(name: string, component: ToolComponent) {
    this.components.set(name, component)
  }

  // 获取组件
  get(name: string): ToolComponent | undefined {
    return this.components.get(name)
  }

  // 检查组件是否存在
  has(name: string): boolean {
    return this.components.has(name)
  }

  // 渲染组件
  render(name: string, props: ComponentProps): React.ReactElement | null {
    const Component = this.get(name)
    if (!Component) {
      console.warn(`Component "${name}" not found`)
      return null
    }
    return React.createElement(Component, { props })
  }
}

// 全局单例
export const componentRegistry = new ComponentRegistry()

// 渲染 Component 的 React 组件
interface ComponentRendererProps {
  component: string
  props: ComponentProps
}

export const ComponentRenderer: React.FC<ComponentRendererProps> = ({ component, props }) => {
  const Component = componentRegistry.get(component)
  
  if (!Component) {
    return (
      <div className="text-sm text-warning p-2 bg-warning/10 rounded border border-warning/20">
        未找到组件: {component}
      </div>
    )
  }

  return <Component props={props} />
}

