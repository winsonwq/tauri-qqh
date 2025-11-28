import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'
import { useEffect, useState } from 'react'

interface PlaceholderProps {
  placeholder?: string
}

/**
 * 占位符组件 - 当编辑器为空时显示占位符文本
 */
export function Placeholder({ placeholder }: PlaceholderProps) {
  const [editor] = useLexicalComposerContext()
  const [isEmpty, setIsEmpty] = useState(true)

  useEffect(() => {
    const removeUpdateListener = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot()
        const isEmpty = root.getTextContent().trim() === ''
        setIsEmpty(isEmpty)
      })
    })

    return () => {
      removeUpdateListener()
    }
  }, [editor])

  if (!isEmpty || !placeholder) {
    return null
  }

  return (
    <div className="rich-text-editor-placeholder">
      {placeholder}
    </div>
  )
}

