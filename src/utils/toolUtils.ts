import { MCPServerInfo, MCPTool } from '../models'
import { ToolCall } from '../componets/AI/ToolCallConfirmModal'

/**
 * 获取可用的 MCP 工具（只返回 enabled 为 true 的服务器工具）
 */
export function getAvailableTools(mcpServers: MCPServerInfo[]): MCPTool[] {
  const tools: MCPTool[] = []
  mcpServers.forEach((server) => {
    // 只包含 enabled 为 true 且已连接的服务器
    const isEnabled = server.config.enabled ?? true
    if (isEnabled && server.status === 'connected' && server.tools) {
      tools.push(...server.tools)
    }
  })
  return tools
}

/**
 * 查找工具对应的服务器
 */
export function findToolServer(
  toolName: string,
  mcpServers: MCPServerInfo[],
): MCPServerInfo | null {
  return (
    mcpServers.find((server) => server.tools?.some((tool) => tool.name === toolName)) || null
  )
}

/**
 * 检查工具是否属于默认 MCP
 */
export function isDefaultMCPTool(toolName: string, mcpServers: MCPServerInfo[]): boolean {
  const server = findToolServer(toolName, mcpServers)
  return server?.is_default === true
}

/**
 * 检查所有工具调用是否都属于默认 MCP
 */
export function areAllDefaultMCPTools(
  toolCalls: ToolCall[],
  mcpServers: MCPServerInfo[],
): boolean {
  return toolCalls.every((toolCall) => isDefaultMCPTool(toolCall.function.name, mcpServers))
}

