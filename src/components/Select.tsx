import { useState, useRef, useEffect, useCallback } from 'react'
import { HiChevronDown } from 'react-icons/hi2'
import { IconType } from 'react-icons'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  icon?: IconType
}

interface SelectProps {
  value?: string
  options: SelectOption[]
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  required?: boolean
  'aria-label'?: string
  dropdownClassName?: string // 下拉选项列表的自定义样式类
}

const Select = ({
  value,
  options,
  onChange,
  placeholder = '请选择...',
  disabled = false,
  className = '',
  size = 'md',
  required = false,
  'aria-label': ariaLabel,
  dropdownClassName = '',
}: SelectProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom')
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedOptionRef = useRef<HTMLLIElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const hasInitializedScrollRef = useRef(false)
  const isKeyboardNavigationRef = useRef(false)

  // 获取选中项的标签
  const selectedOption = value !== undefined && value !== null && value !== '' 
    ? options.find((opt) => opt.value === value)
    : undefined
  const displayText = selectedOption ? selectedOption.label : placeholder

  // 计算下拉框位置
  const calculatePosition = useCallback(() => {
    if (!containerRef.current || !dropdownRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - containerRect.bottom
    const spaceAbove = containerRect.top
    const dropdownHeight = 200 // 预估下拉框高度

    // 如果下方空间不足且上方空间更大，则向上展开
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      setDropdownPosition('top')
    } else {
      setDropdownPosition('bottom')
    }
  }, [])

  // 打开下拉框
  const handleOpen = useCallback(() => {
    if (disabled) return
    setIsOpen(true)
    hasInitializedScrollRef.current = false // 重置滚动初始化标志
    const currentIndex = value !== undefined && value !== null && value !== ''
      ? options.findIndex((opt) => opt.value === value)
      : -1
    setFocusedIndex(currentIndex >= 0 ? currentIndex : 0)
    // 延迟计算位置，确保 DOM 已更新
    setTimeout(() => {
      calculatePosition()
    }, 0)
  }, [disabled, options, value, calculatePosition])

  // 关闭下拉框
  const handleClose = useCallback(() => {
    setIsOpen(false)
    setFocusedIndex(-1)
    hasInitializedScrollRef.current = false // 重置滚动初始化标志
  }, [])

  // 选择选项
  const handleSelect = useCallback(
    (optionValue: string) => {
      if (onChange) {
        onChange(optionValue)
      }
      handleClose()
    },
    [onChange, handleClose],
  )

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        handleClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen, handleClose])

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          handleOpen()
        }
        return
      }

      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          handleClose()
          break
        case 'ArrowDown':
          event.preventDefault()
          isKeyboardNavigationRef.current = true
          setFocusedIndex((prev) => {
            const nextIndex = prev < options.length - 1 ? prev + 1 : 0
            return nextIndex
          })
          break
        case 'ArrowUp':
          event.preventDefault()
          isKeyboardNavigationRef.current = true
          setFocusedIndex((prev) => {
            const nextIndex = prev > 0 ? prev - 1 : options.length - 1
            return nextIndex
          })
          break
        case 'Enter':
          event.preventDefault()
          if (focusedIndex >= 0 && focusedIndex < options.length) {
            const option = options[focusedIndex]
            if (!option.disabled) {
              handleSelect(option.value)
            }
          }
          break
        case 'Tab':
          handleClose()
          break
      }
    }

    if (containerRef.current) {
      const element = containerRef.current
      element.addEventListener('keydown', handleKeyDown)
      return () => {
        element.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [isOpen, focusedIndex, options, handleSelect, handleOpen, handleClose])

  // 只在首次打开时滚动到选中的选项
  useEffect(() => {
    if (isOpen && selectedOptionRef.current && !hasInitializedScrollRef.current) {
      // 只在首次打开时滚动到选中项
      selectedOptionRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
      hasInitializedScrollRef.current = true
    }
  }, [isOpen])

  // 键盘导航时，只在选项不在视口内时才滚动
  useEffect(() => {
    if (
      isOpen &&
      hasInitializedScrollRef.current &&
      focusedIndex >= 0 &&
      isKeyboardNavigationRef.current
    ) {
      // 只在键盘导航时，如果选项不在视口内才滚动
      const dropdown = dropdownRef.current
      const focusedOption = dropdown?.querySelector(`li:nth-child(${focusedIndex + 1})`) as HTMLElement
      if (focusedOption) {
        const dropdownRect = dropdown?.getBoundingClientRect()
        const optionRect = focusedOption.getBoundingClientRect()
        
        // 如果选项不在视口内，才滚动
        if (
          dropdownRect &&
          (optionRect.top < dropdownRect.top || optionRect.bottom > dropdownRect.bottom)
        ) {
          focusedOption.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth',
          })
        }
      }
      // 重置键盘导航标志
      isKeyboardNavigationRef.current = false
    }
  }, [isOpen, focusedIndex])

  // 窗口大小变化时重新计算位置
  useEffect(() => {
    if (isOpen) {
      const handleResize = () => {
        calculatePosition()
      }
      window.addEventListener('resize', handleResize)
      window.addEventListener('scroll', calculatePosition, true)
      return () => {
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('scroll', calculatePosition, true)
      }
    }
  }, [isOpen, calculatePosition])

  // 尺寸样式映射
  const sizeClasses = {
    xs: 'h-6 text-xs px-2',
    sm: 'h-8 text-sm px-3',
    md: 'h-10 text-base px-4',
    lg: 'h-12 text-lg px-5',
  }

  // 使用自定义样式替代 daisyui 的 select 类，避免图标叠加
  const baseClasses = `w-full ${sizeClasses[size]} border border-base-300 rounded-lg bg-base-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 ${className}`

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        className={`${baseClasses} flex items-center justify-between ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        } ${!selectedOption ? 'text-base-content/50' : ''}`}
        onClick={handleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
        aria-required={required}
      >
        <span className="truncate flex-1 text-left flex items-center gap-1.5">
          {selectedOption?.icon && (
            <selectedOption.icon className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          {displayText}
        </span>
        <HiChevronDown
          className={`h-4 w-4 flex-shrink-0 ml-2 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`absolute z-50 min-w-full max-w-[200px] mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-60 overflow-auto ${
            dropdownPosition === 'top' ? 'bottom-full mb-1' : 'top-full'
          } ${dropdownClassName}`}
          role="listbox"
          aria-label={ariaLabel || placeholder}
        >
          {options.length === 0 ? (
            <div className="px-4 py-2 text-sm text-base-content/50 text-center">
              暂无选项
            </div>
          ) : (
            <ul className="py-1">
              {options.map((option, index) => {
                const isSelected = option.value === value
                const isFocused = index === focusedIndex
                const isDisabled = option.disabled

                return (
                  <li
                    key={option.value}
                    ref={isSelected ? selectedOptionRef : null}
                    role="option"
                    aria-selected={isSelected}
                    className={`px-4 py-2 cursor-pointer text-sm transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-content'
                        : isFocused
                        ? 'bg-base-200'
                        : 'hover:bg-base-200'
                    } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => !isDisabled && handleSelect(option.value)}
                    onMouseEnter={() => !isDisabled && setFocusedIndex(index)}
                    title={option.label}
                  >
                    <span className="truncate block flex items-center gap-2">
                      {option.icon && (
                        <option.icon className="h-4 w-4 flex-shrink-0" />
                      )}
                      {option.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default Select

