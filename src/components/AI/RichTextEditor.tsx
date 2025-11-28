import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { EditorState, LexicalEditor } from 'lexical'
import { useRef, forwardRef, useImperativeHandle } from 'react'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { MentionPlugin, MentionOption } from './MentionPlugin'
import { AutosizePlugin } from './plugins/AutosizePlugin'
import { EditorContent } from './EditorContent'
import { createEditorConfig } from './editorConfig'
import { sendContent } from '../../utils/editorUtils'
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

export interface RichTextEditorRef {
  send: () => void
}

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(({
  placeholder = '在这里输入消息，按 Enter 发送...',
  onSend,
  minHeight = 40,
  maxHeight = 200,
  mentionOptions = [],
  onMentionSearch,
  triggers = ['#', '@'],
}, ref) => {
  const editorRef = useRef<LexicalEditor | null>(null)
  const initialConfig = createEditorConfig()

  const handleChange = (_editorState: EditorState, editor: LexicalEditor) => {
    editorRef.current = editor
  }

  // 暴露发送方法给父组件
  useImperativeHandle(ref, () => ({
    send: () => {
      if (editorRef.current) {
        sendContent(editorRef.current, onSend)
      }
    },
  }), [onSend])

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="rich-text-editor-container" style={{ position: 'relative' }}>
        <RichTextPlugin
          contentEditable={
            <EditorContent 
              placeholder={placeholder} 
              onSend={onSend}
              onEditorReady={(editor) => {
                editorRef.current = editor
              }}
            />
          }
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
})

RichTextEditor.displayName = 'RichTextEditor'

export default RichTextEditor


