import { useState, useEffect, useRef, ReactNode, SyntheticEvent } from 'react'
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
  const dropdownRef = useRef<HTMLDetailsElement>(null)

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
        if (dropdownRef.current) {
          dropdownRef.current.removeAttribute('open')
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

  // 同步 details 元素的 open 状态
  useEffect(() => {
    if (dropdownRef.current) {
      if (isOpen) {
        dropdownRef.current.setAttribute('open', '')
      } else {
        dropdownRef.current.removeAttribute('open')
      }
    }
  }, [isOpen])

  const handleSelect = (id: T) => {
    onSelect(id)
    setIsOpen(false)
    if (dropdownRef.current) {
      dropdownRef.current.removeAttribute('open')
    }
  }

  const handleToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    if (disabled) {
      e.preventDefault()
      return
    }
    setIsOpen(e.currentTarget.open)
  }

  return (
    <details
      ref={dropdownRef}
      className={`dropdown dropdown-${position} ${className}`}
      onToggle={handleToggle}
    >
      <summary
        className={`rounded-full ${summaryClassName} ${
          loading ? 'loading' : ''
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        {summaryContent}
        <HiChevronDown className="h-4 w-4 flex-shrink-0" />
      </summary>
      <ul
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
    </details>
  )
}

export default Dropdown
