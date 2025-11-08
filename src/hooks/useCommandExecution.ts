import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// 生成唯一 ID
function generateEventId(): string {
  return `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// 命令执行结果
export interface CommandExecutionResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  success: boolean;
}

// Hook 选项
export interface UseCommandExecutionOptions {
  // 是否自动清理事件监听器（默认 true）
  autoCleanup?: boolean;
  // 是否在命令执行完成后保留输出（默认 true）
  keepOutput?: boolean;
}

// Hook 返回值
export interface UseCommandExecutionReturn {
  // 执行命令
  execute: (command: string, args?: string[], workingDir?: string) => Promise<CommandExecutionResult>;
  // 实时 stdout 输出
  stdout: string;
  // 实时 stderr 输出
  stderr: string;
  // 是否正在运行
  isRunning: boolean;
  // 执行结果
  result: CommandExecutionResult | null;
  // 错误信息
  error: string | null;
  // 清除输出
  clear: () => void;
  // 停止命令（如果支持）
  stop: () => void;
}

/**
 * 用于执行命令并实时监听输出的 React Hook
 * 
 * @example
 * ```tsx
 * const { execute, stdout, stderr, isRunning, result } = useCommandExecution();
 * 
 * const handleRun = async () => {
 *   await execute('ls', ['-la'], '/path/to/dir');
 * };
 * ```
 */
export function useCommandExecution(
  options: UseCommandExecutionOptions = {}
): UseCommandExecutionReturn {
  const {
    autoCleanup = true,
    keepOutput = true,
  } = options;

  const [stdout, setStdout] = useState<string>('');
  const [stderr, setStderr] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<CommandExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 保存事件监听器的清理函数
  const unlistenRef = useRef<{ stdout?: UnlistenFn; stderr?: UnlistenFn }>({});
  const currentEventIdRef = useRef<string | null>(null);

  // 清理事件监听器
  const cleanup = useCallback(() => {
    if (unlistenRef.current.stdout) {
      unlistenRef.current.stdout();
      unlistenRef.current.stdout = undefined;
    }
    if (unlistenRef.current.stderr) {
      unlistenRef.current.stderr();
      unlistenRef.current.stderr = undefined;
    }
  }, []);

  // 清除输出
  const clear = useCallback(() => {
    setStdout('');
    setStderr('');
    setResult(null);
    setError(null);
  }, []);

  // 停止命令（目前只是清理，实际停止需要后端支持）
  const stop = useCallback(() => {
    cleanup();
    setIsRunning(false);
  }, [cleanup]);

  // 执行命令
  const execute = useCallback(async (
    command: string,
    args: string[] = [],
    workingDir?: string
  ): Promise<CommandExecutionResult> => {
    try {
      setIsRunning(true);
      setError(null);
      
      // 如果不保留输出，清除之前的输出
      if (!keepOutput) {
        setStdout('');
        setStderr('');
      }

      // 生成唯一的事件 ID
      const eventId = generateEventId();
      currentEventIdRef.current = eventId;

      // 清理之前的事件监听器
      cleanup();

      // 设置实时输出监听
      const stdoutEventName = `cmd-stdout-${eventId}`;
      const stderrEventName = `cmd-stderr-${eventId}`;

      // 监听 stdout
      const unlistenStdout = await listen<string>(stdoutEventName, (event) => {
        setStdout((prev) => {
          const newLine = event.payload;
          return prev ? `${prev}\n${newLine}` : newLine;
        });
      });

      // 监听 stderr
      const unlistenStderr = await listen<string>(stderrEventName, (event) => {
        setStderr((prev) => {
          const newLine = event.payload;
          return prev ? `${prev}\n${newLine}` : newLine;
        });
      });

      unlistenRef.current = {
        stdout: unlistenStdout,
        stderr: unlistenStderr,
      };

      // 执行命令
      const executionResult = await invoke<CommandExecutionResult>('execute_command', {
        command,
        args,
        eventId,
        workingDir: workingDir || null,
      });

      // 更新最终结果
      setResult(executionResult);
      setIsRunning(false);

      // 如果设置了自动清理，清理事件监听器
      if (autoCleanup) {
        cleanup();
      }

      return executionResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setIsRunning(false);
      cleanup();
      throw err;
    }
  }, [autoCleanup, keepOutput, cleanup]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    execute,
    stdout,
    stderr,
    isRunning,
    result,
    error,
    clear,
    stop,
  };
}

