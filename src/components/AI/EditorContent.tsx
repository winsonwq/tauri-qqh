import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalEditor } from 'lexical'
import { useEffect, useRef } from 'react'
import { Placeholder } from './plugins/Placeholder'
import { sendContent } from '../../utils/editorUtils'

interface EditorContentProps {
  placeholder?: string
  onSend?: (content: string) => void
  onEditorReady?: (editor: LexicalEditor) => void
}

/**
 * 编辑器内容组件 - 处理编辑器的内容区域、键盘事件和占位符
 */
export function EditorContent({ 
  placeholder, 
  onSend,
  onEditorReady
}: EditorContentProps) {
  const [editor] = useLexicalComposerContext()
  const contentRef = useRef<HTMLDivElement>(null)

  // 通知父组件编辑器已准备好
  useEffect(() => {
    if (onEditorReady) {
      onEditorReady(editor)
    }
  }, [editor, onEditorReady])

  // 处理键盘事件
  useEffect(() => {
    if (!onSend) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendContent(editor, onSend)
      }
    }

    const contentEditable = contentRef.current
    if (contentEditable) {
      contentEditable.addEventListener('keydown', handleKeyDown)
      return () => {
        contentEditable.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [editor, onSend])

  return (
    <div className="rich-text-editor-wrapper" ref={contentRef}>
      <ContentEditable
        className="rich-text-editor-content"
        spellCheck={false}
        style={{
          outline: 'none',
          padding: '12px',
        }}
      />
      <Placeholder placeholder={placeholder} />
    </div>
  )
}

