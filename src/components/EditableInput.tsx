import React, { useState, useRef, useEffect } from 'react'

interface EditableInputProps {
  value: string
  placeholder?: string
  className?: string
  onSave: (newValue: string) => Promise<void> | void
  disabled?: boolean
  displayClassName?: string
  tooltip?: string
}

export const EditableInput: React.FC<EditableInputProps> = ({
  value,
  placeholder = '',
  className = '',
  onSave,
  disabled = false,
  displayClassName = 'text-sm font-medium truncate hover:text-primary transition-colors',
  tooltip = '单击编辑',
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editingValue, setEditingValue] = useState(value)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setEditingValue(value)
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleClick = () => {
    if (!disabled) {
      setIsEditing(true)
      setEditingValue(value)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditingValue(value)
  }

  const handleSubmit = async () => {
    const trimmedValue = editingValue.trim()
    if (trimmedValue) {
      try {
        await onSave(trimmedValue)
        setIsEditing(false)
      } catch (error) {
        // 保存失败时保持编辑状态
        console.error('保存失败:', error)
      }
    } else {
      handleCancel()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className={`input input-sm input-bordered w-full ${className}`}
        value={editingValue}
        onChange={(e) => setEditingValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleCancel}
        placeholder={placeholder}
      />
    )
  }

  return (
    <div
      className={`min-h-[2rem] flex items-center ${displayClassName} ${className}`}
      onClick={handleClick}
      title={disabled ? undefined : tooltip}
    >
      {value || placeholder}
    </div>
  )
}

