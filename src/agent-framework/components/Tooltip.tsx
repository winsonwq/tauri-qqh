import { ReactNode } from 'react'

interface TooltipProps {
  /** Tooltip 提示内容 */
  content: ReactNode
  /** 子元素 */
  children: ReactNode
  /** Tooltip 位置，默认为 'top' */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** 自定义 tooltip 内容样式类名 */
  contentClassName?: string
  /** 自定义容器样式类名 */
  className?: string
}

const Tooltip = ({
  content,
  children,
  position = 'top',
  contentClassName = '',
  className = '',
}: TooltipProps) => {
  const positionClass = `tooltip-${position}`

  return (
    <div className={`tooltip ${positionClass} ${className}`}>
      <div className={`tooltip-content ${contentClassName}`}>{content}</div>
      {children}
    </div>
  )
}

export default Tooltip

