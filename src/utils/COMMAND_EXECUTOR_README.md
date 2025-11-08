# 命令行执行器使用指南

本指南介绍如何使用前端命令行执行机制来执行命令并实时监听 stdout 和 stderr 输出。

## 功能特性

- ✅ 前端直接触发命令执行
- ✅ 实时监听 stdout 和 stderr 输出
- ✅ 支持设置工作目录
- ✅ 自动事件清理
- ✅ 提供 React Hook 和工具类两种使用方式

## 使用方式

### 方式 1: 使用 React Hook（推荐在组件中使用）

```tsx
import { useCommandExecution } from '../hooks/useCommandExecution';

function MyComponent() {
  const { execute, stdout, stderr, isRunning, result, error, clear } = useCommandExecution();

  const handleRun = async () => {
    try {
      const result = await execute('ls', ['-la'], '/path/to/dir');
      console.log('执行完成:', result);
    } catch (err) {
      console.error('执行失败:', err);
    }
  };

  return (
    <div>
      <button onClick={handleRun} disabled={isRunning}>
        {isRunning ? '运行中...' : '执行命令'}
      </button>
      {stdout && <pre>{stdout}</pre>}
      {stderr && <pre style={{ color: 'red' }}>{stderr}</pre>}
      {result && <p>退出码: {result.exit_code}</p>}
    </div>
  );
}
```

#### Hook 选项

```tsx
const { execute, ... } = useCommandExecution({
  autoCleanup: true,    // 是否自动清理事件监听器（默认 true）
  keepOutput: true,     // 是否在命令执行完成后保留输出（默认 true）
});
```

#### Hook 返回值

- `execute(command, args?, workingDir?)`: 执行命令的函数
- `stdout`: 实时 stdout 输出（字符串）
- `stderr`: 实时 stderr 输出（字符串）
- `isRunning`: 是否正在运行（布尔值）
- `result`: 执行结果（CommandExecutionResult | null）
- `error`: 错误信息（string | null）
- `clear()`: 清除所有输出
- `stop()`: 停止命令（清理事件监听器）

### 方式 2: 使用 CommandExecutor 类

```tsx
import { CommandExecutor } from '../utils/commandExecutor';

const executor = new CommandExecutor();

try {
  const result = await executor.execute('echo', ['Hello World'], {
    onStdout: (line) => {
      console.log('实时输出:', line);
    },
    onStderr: (line) => {
      console.error('实时错误:', line);
    },
    workingDir: '/path/to/dir',
    autoCleanup: true,
  });

  console.log('执行结果:', result);
} catch (err) {
  console.error('执行失败:', err);
} finally {
  executor.cleanup(); // 手动清理（如果 autoCleanup 为 false）
}
```

### 方式 3: 使用便捷函数（不监听实时输出）

```tsx
import { executeCommand } from '../utils/commandExecutor';

try {
  const result = await executeCommand('ls', ['-la'], '/path/to/dir');
  console.log('标准输出:', result.stdout);
  console.log('错误输出:', result.stderr);
  console.log('退出码:', result.exit_code);
  console.log('成功:', result.success);
} catch (err) {
  console.error('执行失败:', err);
}
```

### 方式 4: 使用便捷函数（监听实时输出）

```tsx
import { executeCommandWithOutput } from '../utils/commandExecutor';

try {
  const result = await executeCommandWithOutput('ping', ['-c', '5', 'google.com'], {
    onStdout: (line) => {
      console.log('实时输出:', line);
    },
    onStderr: (line) => {
      console.error('实时错误:', line);
    },
    workingDir: '/path/to/dir',
  });

  console.log('执行完成:', result);
} catch (err) {
  console.error('执行失败:', err);
}
```

## API 参考

### CommandExecutionResult

```typescript
interface CommandExecutionResult {
  exit_code: number | null;  // 退出码
  stdout: string;            // 标准输出
  stderr: string;            // 标准错误输出
  success: boolean;          // 是否成功（退出码为 0）
}
```

### CommandExecutorOptions

```typescript
interface CommandExecutorOptions {
  workingDir?: string;       // 工作目录
  onStdout?: (line: string) => void;  // stdout 实时回调
  onStderr?: (line: string) => void;  // stderr 实时回调
  autoCleanup?: boolean;     // 是否自动清理事件监听器（默认 true）
}
```

## 注意事项

1. **事件清理**: 如果使用 Hook，组件卸载时会自动清理事件监听器。如果使用 CommandExecutor 类，建议在 finally 块中调用 `cleanup()`。

2. **实时输出**: 实时输出通过 Tauri 事件系统推送，每行输出会触发一次回调。

3. **工作目录**: 如果不指定工作目录，命令会在应用的工作目录中执行。

4. **错误处理**: 如果命令执行失败（退出码非 0），`success` 字段为 `false`，但不会抛出异常。只有在命令无法启动或执行过程中出错时才会抛出异常。

5. **并发执行**: 每个 CommandExecutor 实例或 Hook 实例应该只执行一个命令。如果需要并发执行多个命令，请创建多个实例。

## 示例场景

### 场景 1: 执行系统命令并显示输出

```tsx
function SystemCommandExample() {
  const { execute, stdout, stderr, isRunning } = useCommandExecution();

  const handleListFiles = async () => {
    await execute('ls', ['-la']);
  };

  return (
    <div>
      <button onClick={handleListFiles} disabled={isRunning}>
        列出文件
      </button>
      <pre>{stdout}</pre>
      {stderr && <pre style={{ color: 'red' }}>{stderr}</pre>}
    </div>
  );
}
```

### 场景 2: 执行长时间运行的命令并实时显示进度

```tsx
function LongRunningCommandExample() {
  const { execute, stdout, isRunning } = useCommandExecution({
    keepOutput: true,
  });

  const handleLongTask = async () => {
    await execute('ping', ['-c', '10', 'google.com']);
  };

  return (
    <div>
      <button onClick={handleLongTask} disabled={isRunning}>
        {isRunning ? '运行中...' : '开始任务'}
      </button>
      <div style={{ maxHeight: '400px', overflow: 'auto' }}>
        <pre>{stdout}</pre>
      </div>
    </div>
  );
}
```

### 场景 3: 在非组件代码中使用

```tsx
// 在工具函数中使用
export async function checkSystemInfo() {
  const executor = new CommandExecutor();
  
  try {
    const result = await executor.execute('uname', ['-a'], {
      onStdout: (line) => {
        console.log('系统信息:', line);
      },
    });
    
    return result.stdout;
  } finally {
    executor.cleanup();
  }
}
```

## 后端实现

后端通过 `execute_command` Tauri command 实现，支持：
- 实时流式读取 stdout 和 stderr
- 通过 Tauri 事件系统推送实时输出
- 返回完整的执行结果

事件命名规则：
- stdout 事件: `cmd-stdout-{eventId}`
- stderr 事件: `cmd-stderr-{eventId}`

其中 `eventId` 由前端生成并传递给后端。

