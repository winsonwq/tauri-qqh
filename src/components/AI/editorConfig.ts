import { InitialConfigType } from '@lexical/react/LexicalComposer'
import { TagNode } from './TagNode'
import { onLexicalError } from '../../utils/editorUtils'

/**
 * Lexical 编辑器的初始配置
 */
export const createEditorConfig = (): InitialConfigType => ({
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
  onError: onLexicalError,
})

