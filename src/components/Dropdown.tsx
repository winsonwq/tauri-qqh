import { useState, useEffect, useRef, ReactNode } from 'react'
import { HiChevronDown } from 'react-icons/hi2'

export interface DropdownOption<T = string> {
  id: T
  [key: string]: any
}

interface DropdownProps<T = string> {
  /** 选中的选项 ID */
  selectedId?: T
  /** 选项列表 */
  options: DropdownOption<T>[]
  /** 选项选中时的回调 */
  onSelect: (id: T) => void
  /** 自定义 summary（按钮）内容 */
  summary: ReactNode | ((selectedOption?: DropdownOption<T>) => ReactNode)
  /** 自定义选项渲染函数 */
  renderOption: (option: DropdownOption<T>, isSelected: boolean) => ReactNode
  /** 下拉框位置 */
  position?: 'top' | 'bottom'
  /** 是否显示加载状态 */
  loading?: boolean
  /** summary 的额外 className */
  summaryClassName?: string
  /** dropdown-content 的额外 className */
  contentClassName?: string
  /** details 的额外 className */
  className?: string
  /** 是否禁用 */
  disabled?: boolean
}

const Dropdown = <T extends string | number = string>({
  selectedId,
  options,
  onSelect,
  summary,
  renderOption,
  position = 'top',
  loading = false,
  summaryClassName = '',
  contentClassName = '',
  className = '',
  disabled = false,
}: DropdownProps<T>) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLDivElement>(null)
  const isSelectingRef = useRef(false) // 标记是否正在选中选项

  // 获取选中的选项
  const selectedOption = selectedId
    ? options.find((opt) => opt.id === selectedId)
    : undefined

  // 计算 summary 内容
  const summaryContent =
    typeof summary === 'function' ? summary(selectedOption) : summary

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        // 移除焦点以关闭下拉菜单
        if (buttonRef.current) {
          buttonRef.current.blur()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  const handleSelect = (id: T) => {
    // 标记正在选中，避免 blur 事件干扰
    isSelectingRef.current = true
    onSelect(id)
    setIsOpen(false)
    // 移除焦点以关闭下拉菜单
    if (buttonRef.current) {
      buttonRef.current.blur()
    }
    // 重置标记，使用 setTimeout 确保在 blur 事件之后
    setTimeout(() => {
      isSelectingRef.current = false
    }, 0)
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    if (disabled) {
      e.preventDefault()
      return
    }
    // 让按钮获得焦点，这样 DaisyUI 的 CSS 会显示下拉菜单
    if (buttonRef.current) {
      buttonRef.current.focus()
    }
    setIsOpen(true)
  }

  const handleButtonBlur = (e: React.FocusEvent) => {
    // 如果是因为选中选项而关闭的，不执行延迟关闭逻辑
    if (isSelectingRef.current) {
      return
    }
    // 如果焦点移到了下拉内容内部，不要关闭
    if (
      dropdownRef.current &&
      dropdownRef.current.contains(e.relatedTarget as Node)
    ) {
      return
    }
    // 延迟关闭，以便点击事件能够正常触发
    setTimeout(() => {
      setIsOpen(false)
    }, 150)
  }

  return (
    <div
      ref={dropdownRef}
      className={`dropdown dropdown-${position} ${isOpen ? 'dropdown-open' : ''} ${className}`}
    >
      <div
        ref={buttonRef}
        tabIndex={disabled ? -1 : 0}
        role="button"
        className={`rounded-full ${summaryClassName} ${
          loading ? 'loading' : ''
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        onClick={handleButtonClick}
        onBlur={handleButtonBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (buttonRef.current) {
              buttonRef.current.focus()
            }
            setIsOpen(true)
          } else if (e.key === 'Escape') {
            setIsOpen(false)
            buttonRef.current?.blur()
          }
        }}
      >
        {summaryContent}
        <HiChevronDown className="h-4 w-4 flex-shrink-0" />
      </div>
      <ul
        tabIndex={-1}
        className={`menu dropdown-content bg-base-100 rounded-box z-[1] w-52 p-2 shadow-sm mb-1 max-h-60 overflow-auto ${contentClassName}`}
      >
        {options.map((option) => {
          const isSelected = option.id === selectedId
          return (
            <li
              key={String(option.id)}
              className={isSelected ? 'menu-active rounded-sm' : ''}
            >
              <a onClick={() => handleSelect(option.id)}>
                {renderOption(option, isSelected)}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default Dropdown
