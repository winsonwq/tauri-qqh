/**
 * Tauri 工具信息提供者适配器
 */

import { IToolInfoProvider } from '../core/interfaces'
import { ToolInfo } from '../core/types'
import { ToolCall } from '../core/types'
import { MCPServerInfo, MCPTool } from '../../models'
import {
  findToolServer,
  areAllDefaultMCPTools,
} from '../../utils/toolUtils'

export class TauriToolInfoProvider implements IToolInfoProvider {
  constructor(private mcpServers: MCPServerInfo[]) {}

  getToolInfoList(): ToolInfo[] {
    const toolInfoList: ToolInfo[] = []
    for (const server of this.mcpServers) {
      const isEnabled = server.config?.enabled ?? true
      if (isEnabled && server.status === 'connected' && server.tools) {
        for (const tool of server.tools) {
          toolInfoList.push({
            name: tool.name,
            description: tool.description || '',
          })
        }
      }
    }
    return toolInfoList
  }

  /**
   * 获取完整的工具列表（包含 inputSchema）
   */
  getFullToolList(): MCPTool[] {
    const toolList: MCPTool[] = []
    for (const server of this.mcpServers) {
      const isEnabled = server.config?.enabled ?? true
      if (isEnabled && server.status === 'connected' && server.tools) {
        for (const tool of server.tools) {
          toolList.push(tool)
        }
      }
    }
    return toolList
  }

  findToolServer(toolName: string): { key?: string; name: string } | null {
    const server = findToolServer(toolName, this.mcpServers)
    if (!server) {
      return null
    }
    return {
      key: server.key,
      name: server.name,
    }
  }

  areAllToolsAutoConfirmable(toolCalls: ToolCall[]): boolean {
    return areAllDefaultMCPTools(toolCalls, this.mcpServers)
  }
}

