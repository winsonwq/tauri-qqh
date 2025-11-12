import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { $getRoot, EditorState, LexicalEditor } from 'lexical'
import { useEffect, useRef, useState } from 'react'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { TagNode } from './TagNode'
import { MentionPlugin, MentionOption } from './MentionPlugin'
import './RichTextEditor.css'

interface RichTextEditorProps {
  placeholder?: string
  onSend?: (content: string) => void
  minHeight?: number
  maxHeight?: number
  mentionOptions?: MentionOption[]
  onMentionSearch?: (query: string, trigger: string) => Promise<MentionOption[]>
  triggers?: string[]
}

// Autosize 插件
function AutosizePlugin({ minHeight = 40, maxHeight = 200 }: { minHeight?: number; maxHeight?: number }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const updateHeight = () => {
      const rootElement = editor.getRootElement()
      if (rootElement) {
        const contentEditable = rootElement.querySelector('[contenteditable="true"]') as HTMLElement
        if (contentEditable) {
          contentEditable.style.height = 'auto'
          const scrollHeight = contentEditable.scrollHeight
          const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight)
          contentEditable.style.height = `${newHeight}px`
        }
      }
    }

    // 监听编辑器内容变化
    const removeUpdateListener = editor.registerUpdateListener(() => {
      setTimeout(updateHeight, 0)
    })

    // 初始设置
    setTimeout(updateHeight, 100)

    return () => {
      removeUpdateListener()
    }
  }, [editor, minHeight, maxHeight])

  return null
}

// 占位符组件
function Placeholder({ placeholder }: { placeholder?: string }) {
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

// 编辑器内容组件
function EditorContent({ placeholder, onSend }: { placeholder?: string; onSend?: (content: string) => void }) {
  const [editor] = useLexicalComposerContext()
  const contentRef = useRef<HTMLDivElement>(null)

  // 处理键盘事件
  useEffect(() => {
    if (!onSend) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        editor.getEditorState().read(() => {
          const root = $getRoot()
          const content = root.getTextContent()
          if (content.trim()) {
            onSend(content.trim())
            // 清空编辑器
            editor.update(() => {
              const root = $getRoot()
              root.clear()
            })
          }
        })
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
          minHeight: '40px',
          padding: '12px',
        }}
      />
      <Placeholder placeholder={placeholder} />
      <LexicalErrorBoundary
        onError={(error: Error) => {
          console.error('Lexical Error Boundary Error:', error)
        }}
      >
        <div />
      </LexicalErrorBoundary>
    </div>
  )
}

const RichTextEditor = ({
  placeholder = '在这里输入消息，按 Enter 发送...',
  onSend,
  minHeight = 40,
  maxHeight = 200,
  mentionOptions = [],
  onMentionSearch,
  triggers = ['#', '@'],
}: RichTextEditorProps) => {
  const editorRef = useRef<LexicalEditor | null>(null)

  const initialConfig = {
    namespace: 'AIMessageEditor',
    theme: {
      paragraph: 'rich-text-editor-paragraph',
      text: {
        bold: 'rich-text-editor-text-bold',
        italic: 'rich-text-editor-text-italic',
        underline: 'rich-text-editor-text-underline',
      },
    },
    nodes: [TagNode],
    onError: (error: Error) => {
      console.error('Lexical Editor Error:', error)
    },
  }

  const handleChange = (_editorState: EditorState, editor: LexicalEditor) => {
    editorRef.current = editor
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="rich-text-editor-container" style={{ position: 'relative' }}>
        <RichTextPlugin
          contentEditable={<EditorContent placeholder={placeholder} onSend={onSend} />}
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <OnChangePlugin onChange={handleChange} />
        <AutosizePlugin minHeight={minHeight} maxHeight={maxHeight} />
        <MentionPlugin
          triggers={triggers}
          options={mentionOptions}
          onSearch={onMentionSearch}
        />
      </div>
    </LexicalComposer>
  )
}

export default RichTextEditor

