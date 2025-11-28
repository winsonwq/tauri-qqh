// Mention 功能已暂时移除
export interface MentionOption {
  id: string
  label: string
  value: string
  type?: 'mention' | 'hashtag' | 'custom'
  icon?: string
}

interface MentionPluginProps {
  triggers?: string[]
  options?: MentionOption[]
  onSearch?: (query: string, trigger: string) => Promise<MentionOption[]>
  maxSuggestions?: number
}

export function MentionPlugin(_props: MentionPluginProps) {
  // Mention 功能已暂时移除
  return null
}

