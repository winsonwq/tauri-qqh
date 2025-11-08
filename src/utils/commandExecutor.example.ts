/**
 * 命令行执行器使用示例
 * 
 * 本文件展示了如何使用命令行执行器来执行命令并监听输出
 */

import { useCommandExecution } from '../hooks/useCommandExecution';
import { CommandExecutor, executeCommand, executeCommandWithOutput } from './commandExecutor';

// ========== 示例 1: 使用 React Hook ==========
export function ExampleWithHook() {
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
      {stdout && (
        <div>
          <h3>标准输出:</h3>
          <pre>{stdout}</pre>
        </div>
      )}
      {stderr && (
        <div>
          <h3>错误输出:</h3>
          <pre>{stderr}</pre>
        </div>
      )}
      {result && (
        <div>
          <p>退出码: {result.exit_code}</p>
          <p>成功: {result.success ? '是' : '否'}</p>
        </div>
      )}
      <button onClick={clear}>清除输出</button>
    </div>
  );
}

// ========== 示例 2: 使用 CommandExecutor 类 ==========
export async function exampleWithClass() {
  const executor = new CommandExecutor();

  try {
    const result = await executor.execute('echo', ['Hello World'], {
      onStdout: (line) => {
        console.log('实时输出:', line);
      },
      onStderr: (line) => {
        console.error('实时错误:', line);
      },
    });

    console.log('执行结果:', result);
  } catch (err) {
    console.error('执行失败:', err);
  } finally {
    executor.cleanup();
  }
}

// ========== 示例 3: 使用便捷函数（不监听实时输出）==========
export async function exampleWithSimpleFunction() {
  try {
    const result = await executeCommand('ls', ['-la'], '/path/to/dir');
    console.log('执行完成:', result);
    console.log('标准输出:', result.stdout);
    console.log('错误输出:', result.stderr);
  } catch (err) {
    console.error('执行失败:', err);
  }
}

// ========== 示例 4: 使用便捷函数（监听实时输出）==========
export async function exampleWithOutputFunction() {
  try {
    const result = await executeCommandWithOutput('ping', ['-c', '5', 'google.com'], {
      onStdout: (line) => {
        console.log('实时输出:', line);
      },
      onStderr: (line) => {
        console.error('实时错误:', line);
      },
    });

    console.log('执行完成:', result);
  } catch (err) {
    console.error('执行失败:', err);
  }
}

// ========== 示例 5: 在组件中使用 Hook（保留输出）==========
export function ExampleWithKeepOutput() {
  const { execute, stdout, stderr, isRunning, clear } = useCommandExecution({
    keepOutput: true, // 保留之前的输出
    autoCleanup: true, // 自动清理事件监听器
  });

  const handleRunMultiple = async () => {
    // 第一次执行
    await execute('echo', ['First command']);
    // 第二次执行（输出会追加到之前的输出后面）
    await execute('echo', ['Second command']);
  };

  return (
    <div>
      <button onClick={handleRunMultiple} disabled={isRunning}>
        执行多个命令
      </button>
      <button onClick={clear}>清除所有输出</button>
      <pre>{stdout}</pre>
      {stderr && <pre style={{ color: 'red' }}>{stderr}</pre>}
    </div>
  );
}

// ========== 示例 6: 在组件中使用 Hook（不保留输出）==========
export function ExampleWithoutKeepOutput() {
  const { execute, stdout, stderr, isRunning } = useCommandExecution({
    keepOutput: false, // 每次执行新命令时清除之前的输出
    autoCleanup: true,
  });

  const handleRun = async () => {
    await execute('date');
  };

  return (
    <div>
      <button onClick={handleRun} disabled={isRunning}>
        执行命令
      </button>
      <pre>{stdout}</pre>
      {stderr && <pre style={{ color: 'red' }}>{stderr}</pre>}
    </div>
  );
}

