import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

interface AutosizePluginProps {
  minHeight?: number
  maxHeight?: number
}

/**
 * Autosize 插件 - 根据内容自动调整编辑器高度
 */
export function AutosizePlugin({ minHeight = 40, maxHeight = 200 }: AutosizePluginProps) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const updateHeight = () => {
      const rootElement = editor.getRootElement()
      if (rootElement) {
        const contentEditable = rootElement.querySelector('[contenteditable="true"]') as HTMLElement
        if (contentEditable) {
          // 先重置高度和 overflow 以获取真实的 scrollHeight
          contentEditable.style.height = 'auto'
          contentEditable.style.maxHeight = 'none'
          contentEditable.style.overflowY = 'hidden'
          
          // 强制浏览器重新计算布局
          void contentEditable.offsetHeight
          
          const scrollHeight = contentEditable.scrollHeight
          
          // 设置最小和最大高度限制
          contentEditable.style.minHeight = `${minHeight}px`
          contentEditable.style.maxHeight = `${maxHeight}px`
          
          // 当内容超过最大高度时，启用垂直滚动并固定高度
          if (scrollHeight > maxHeight) {
            contentEditable.style.height = `${maxHeight}px`
            contentEditable.style.overflowY = 'auto'
            contentEditable.style.overflowX = 'hidden'
          } else {
            // 内容未超过最大高度，根据内容自适应
            const newHeight = Math.max(scrollHeight, minHeight)
            contentEditable.style.height = `${newHeight}px`
            contentEditable.style.overflowY = 'hidden'
            contentEditable.style.overflowX = 'hidden'
          }
        }
      }
    }

    // 防抖函数，减少频繁更新
    const debouncedUpdate = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      timeoutId = setTimeout(updateHeight, 0)
    }

    // 监听编辑器内容变化
    const removeUpdateListener = editor.registerUpdateListener(() => {
      debouncedUpdate()
    })

    // 初始设置
    setTimeout(updateHeight, 0)

    // 监听窗口大小变化
    const handleResize = () => {
      debouncedUpdate()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      removeUpdateListener()
      window.removeEventListener('resize', handleResize)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [editor, minHeight, maxHeight])

  return null
}

