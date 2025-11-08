import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { CommandExecutionResult } from '../hooks/useCommandExecution';

// 生成唯一 ID
function generateEventId(): string {
  return `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// 命令执行选项
export interface CommandExecutorOptions {
  // 工作目录
  workingDir?: string;
  // 实时输出回调
  onStdout?: (line: string) => void;
  // 实时错误输出回调
  onStderr?: (line: string) => void;
  // 是否自动清理事件监听器（默认 true）
  autoCleanup?: boolean;
}

// 命令执行器类
export class CommandExecutor {
  private unlistenRef: { stdout?: UnlistenFn; stderr?: UnlistenFn } = {};
  private currentEventId: string | null = null;

  /**
   * 执行命令
   * 
   * @param command 命令路径
   * @param args 命令参数
   * @param options 执行选项
   * @returns 执行结果
   * 
   * @example
   * ```ts
   * const executor = new CommandExecutor();
   * const result = await executor.execute('ls', ['-la'], {
   *   onStdout: (line) => console.log('stdout:', line),
   *   onStderr: (line) => console.error('stderr:', line),
   * });
   * ```
   */
  async execute(
    command: string,
    args: string[] = [],
    options: CommandExecutorOptions = {}
  ): Promise<CommandExecutionResult> {
    const {
      workingDir,
      onStdout,
      onStderr,
      autoCleanup = true,
    } = options;

    try {
      // 生成唯一的事件 ID
      const eventId = generateEventId();
      this.currentEventId = eventId;

      // 清理之前的事件监听器
      this.cleanup();

      // 设置实时输出监听
      if (onStdout) {
        const stdoutEventName = `cmd-stdout-${eventId}`;
        const unlistenStdout = await listen<string>(stdoutEventName, (event) => {
          onStdout(event.payload);
        });
        this.unlistenRef.stdout = unlistenStdout;
      }

      if (onStderr) {
        const stderrEventName = `cmd-stderr-${eventId}`;
        const unlistenStderr = await listen<string>(stderrEventName, (event) => {
          onStderr(event.payload);
        });
        this.unlistenRef.stderr = unlistenStderr;
      }

      // 执行命令
      const result = await invoke<CommandExecutionResult>('execute_command', {
        command,
        args,
        eventId,
        workingDir: workingDir || null,
      });

      // 如果设置了自动清理，清理事件监听器
      if (autoCleanup) {
        this.cleanup();
      }

      return result;
    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  /**
   * 清理事件监听器
   */
  cleanup(): void {
    if (this.unlistenRef.stdout) {
      this.unlistenRef.stdout();
      this.unlistenRef.stdout = undefined;
    }
    if (this.unlistenRef.stderr) {
      this.unlistenRef.stderr();
      this.unlistenRef.stderr = undefined;
    }
    this.currentEventId = null;
  }

  /**
   * 获取当前事件 ID
   */
  getCurrentEventId(): string | null {
    return this.currentEventId;
  }
}

// 便捷函数：执行命令并返回结果（不监听实时输出）
export async function executeCommand(
  command: string,
  args: string[] = [],
  workingDir?: string
): Promise<CommandExecutionResult> {
  const executor = new CommandExecutor();
  return executor.execute(command, args, {
    workingDir,
    autoCleanup: true,
  });
}

// 便捷函数：执行命令并监听实时输出
export async function executeCommandWithOutput(
  command: string,
  args: string[] = [],
  options: {
    workingDir?: string;
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
  } = {}
): Promise<CommandExecutionResult> {
  const executor = new CommandExecutor();
  return executor.execute(command, args, {
    ...options,
    autoCleanup: true,
  });
}

