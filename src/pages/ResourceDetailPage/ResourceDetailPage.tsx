import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { exists } from '@tauri-apps/plugin-fs';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { HiArrowLeft } from 'react-icons/hi2';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { setCurrentPage } from '../../redux/slices/featureKeysSlice';
import { appendLog } from '../../redux/slices/transcriptionLogsSlice';
import {
  TranscriptionResource,
  TranscriptionTask,
  TranscriptionTaskStatus,
  TranscriptionParams,
} from '../../models';
import ResourceInfoCard from './components/ResourceInfoCard';
import TranscriptionHistory from './components/TranscriptionHistory';
import LoadingCard from './components/LoadingCard';
import CreateTranscriptionTaskModal from './components/CreateTranscriptionTaskModal';

// 生成唯一的事件 ID
function generateEventId(): string {
  return `transcription-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

const ResourceDetailPage = () => {
  const dispatch = useAppDispatch();
  const { currentPage } = useAppSelector((state) => state.featureKeys);
  const [resource, setResource] = useState<TranscriptionResource | null>(null);
  const [tasks, setTasks] = useState<TranscriptionTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [resultContent, setResultContent] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  
  // 用于存储事件监听器的清理函数
  const unlistenRef = useRef<{ stdout?: UnlistenFn; stderr?: UnlistenFn }>({});

  // 从 currentPage 中提取 resourceId（格式：resource:${resourceId}）
  const resourceId = currentPage?.startsWith('resource:') ? currentPage.replace('resource:', '') : null;

  useEffect(() => {
    if (resourceId) {
      loadResource();
      loadTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  // 轮询任务列表，检测运行中的任务并自动切换
  useEffect(() => {
    if (!resourceId) return;

    // 检查是否有运行中的任务
    const hasRunningTask = tasks.some(t => t.status === TranscriptionTaskStatus.RUNNING);
    
    if (hasRunningTask) {
      // 如果有运行中的任务，每 1 秒刷新一次任务列表，确保及时检测到状态变化
      const interval = setInterval(() => {
        loadTasks(true); // 自动切换到运行中的任务
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, resourceId]);

  // 当选中任务变化时，自动加载转写结果
  useEffect(() => {
    const loadResult = async () => {
      if (!selectedTaskId) {
        setResultContent(null);
        return;
      }
      // 检查任务状态，只有已完成的任务才加载结果
      const task = tasks.find(t => t.id === selectedTaskId);
      if (!task || task.status !== TranscriptionTaskStatus.COMPLETED) {
        setResultContent(null);
        return;
      }
      try {
        const content = await invoke<string>('read_transcription_result', { taskId: selectedTaskId });
        setResultContent(content);
      } catch (err) {
        console.error('读取结果失败:', err);
        setResultContent(null);
      }
    };
    loadResult();
  }, [selectedTaskId, tasks]);

  // 加载资源信息
  const loadResource = async () => {
    if (!resourceId) return;
    try {
      setError(null);
      const resources = await invoke<TranscriptionResource[]>('get_transcription_resources');
      const found = resources.find((r) => r.id === resourceId);

      if (found) {
        setResource(found);
        
        // 使用前端 fs 插件检查文件是否存在
        try {
          const fileExists = await exists(found.file_path);
          if (!fileExists) {
            setError(`音频文件不存在: ${found.file_path}`);
            setAudioSrc(null);
            return;
          }
        } catch (err) {
          console.error('检查文件失败:', err);
          setError(`无法访问音频文件: ${found.file_path}`);
          setAudioSrc(null);
          return;
        }
        
        // 在 Tauri 中，需要使用 convertFileSrc 来转换文件路径
        try {
          const audioPath = convertFileSrc(found.file_path);
          console.log('原始路径:', found.file_path);
          console.log('转换后路径:', audioPath);
          setAudioSrc(audioPath);
        } catch (err) {
          console.error('转换音频路径失败:', err);
          setError('无法创建音频播放器');
          setAudioSrc(null);
        }
      }
    } catch (err) {
      console.error('加载资源失败:', err);
      setError(err instanceof Error ? err.message : '加载资源失败');
      setAudioSrc(null);
    }
  };

  // 加载转写任务列表
  const loadTasks = async (autoSwitchToRunning = true) => {
    if (!resourceId) return;
    try {
      const result = await invoke<TranscriptionTask[]>('get_transcription_tasks', {
        resourceId: resourceId,
      });
      
      // 按创建时间排序，最新的在前
      const sortedTasks = [...result].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      const previousTasks = tasks;
      setTasks(result);
      
      // 选择任务的优先级：
      // 1. 如果有运行中的任务，选择最新的运行中的任务（如果 autoSwitchToRunning 为 true）
      // 2. 否则，如果有已完成的任务，选择最新的已完成的任务
      // 3. 否则，选择最新的任务
      if (sortedTasks.length > 0) {
        const runningTask = sortedTasks.find(t => t.status === TranscriptionTaskStatus.RUNNING);
        if (runningTask && autoSwitchToRunning) {
          // 检查是否是新出现的运行任务，或者当前选中的任务不是运行中的
          const previousRunningTask = previousTasks.find(t => t.id === runningTask.id);
          const isNewRunningTask = !previousRunningTask || previousRunningTask.status !== TranscriptionTaskStatus.RUNNING;
          const currentTaskIsNotRunning = !selectedTaskId || 
            !previousTasks.find(t => t.id === selectedTaskId && t.status === TranscriptionTaskStatus.RUNNING);
          
          // 如果是新出现的运行任务，或者当前选中的任务不是运行中的，则切换到运行中的任务
          if (isNewRunningTask || currentTaskIsNotRunning) {
            setSelectedTaskId(runningTask.id);
          }
        } else if (!runningTask) {
          // 如果没有运行中的任务，保持当前选择或选择已完成的任务
          if (!selectedTaskId || !result.find(t => t.id === selectedTaskId)) {
            const completedTask = sortedTasks.find(t => t.status === TranscriptionTaskStatus.COMPLETED);
            if (completedTask) {
              setSelectedTaskId(completedTask.id);
            } else {
              setSelectedTaskId(sortedTasks[0].id);
            }
          }
        }
      }
    } catch (err) {
      console.error('加载任务失败:', err);
    }
  };

  // 返回列表页
  const handleBack = () => {
    dispatch(setCurrentPage({ feature: 'home', page: null }));
  };

  // 显示创建任务弹窗
  const handleShowCreateTaskModal = () => {
    setShowCreateTaskModal(true);
  };

  // 清理事件监听器
  const cleanupEventListeners = useCallback(() => {
    if (unlistenRef.current.stdout) {
      unlistenRef.current.stdout();
      unlistenRef.current.stdout = undefined;
    }
    if (unlistenRef.current.stderr) {
      unlistenRef.current.stderr();
      unlistenRef.current.stderr = undefined;
    }
  }, []);

  // 创建转写任务（从弹窗确认后调用）
  const handleCreateTask = async (params: TranscriptionParams) => {
    if (!resourceId) return;
    try {
      setError(null);
      setShowCreateTaskModal(false);

      // 创建任务
      const task = await invoke<TranscriptionTask>('create_transcription_task', {
        resourceId: resourceId,
        params: params,
      });

      // 立即切换到新任务并显示 loading
      setSelectedTaskId(task.id);
      setResultContent(null);
      
      // 重新加载任务列表以获取最新状态（不自动切换，因为已经手动切换了）
      await loadTasks(false);

      // 清理之前的事件监听器
      cleanupEventListeners();

      // 生成唯一的事件 ID
      const eventId = generateEventId();

      // 初始化任务的日志数组（确保 Redux 中有该任务的日志数组）
      // 通过 dispatch 一个空字符串来初始化，Redux slice 会创建数组但不会添加空字符串
      dispatch(appendLog({ taskId: task.id, log: '' }));

      // 设置 stdout 事件监听，将日志存储到 Redux
      const stdoutEventName = `transcription-stdout-${eventId}`;
      console.log('设置 stdout 事件监听器:', stdoutEventName, 'taskId:', task.id);
      const unlistenStdout = await listen<string>(stdoutEventName, (event) => {
        console.log('收到 stdout 事件:', event.payload, 'taskId:', task.id);
        // 将日志存储到 Redux（过滤空字符串）
        if (event.payload.trim()) {
          dispatch(appendLog({ taskId: task.id, log: event.payload }));
        }
      });
      unlistenRef.current.stdout = unlistenStdout;

      // 设置 stderr 事件监听，将日志存储到 Redux
      const stderrEventName = `transcription-stderr-${eventId}`;
      console.log('设置 stderr 事件监听器:', stderrEventName, 'taskId:', task.id);
      const unlistenStderr = await listen<string>(stderrEventName, (event) => {
        console.log('收到 stderr 事件:', event.payload, 'taskId:', task.id);
        // 将日志存储到 Redux（过滤空字符串）
        if (event.payload.trim()) {
          dispatch(appendLog({ taskId: task.id, log: event.payload }));
        }
      });
      unlistenRef.current.stderr = unlistenStderr;

      // 异步执行转写任务（不阻塞 UI）
      invoke<string>('execute_transcription_task', {
        taskId: task.id,
        resourceId: resourceId,
        eventId: eventId,
      }).then(() => {
        // 执行完成后清理事件监听器
        cleanupEventListeners();
        // 重新加载任务列表（自动切换到已完成的任务）
        loadTasks(true);
      }).catch((err) => {
        console.error('执行转写任务失败:', err);
        setError(err instanceof Error ? err.message : '执行转写任务失败');
        // 清理事件监听器
        cleanupEventListeners();
        // 即使失败也要重新加载任务列表以更新状态
        loadTasks(true);
      });
    } catch (err) {
      console.error('创建转写任务失败:', err);
      setError(err instanceof Error ? err.message : '创建转写任务失败');
      // 清理事件监听器
      cleanupEventListeners();
    }
  };

  // 组件卸载时清理事件监听器
  useEffect(() => {
    return () => {
      cleanupEventListeners();
    };
  }, [cleanupEventListeners]);

  if (!resource) {
    return (
      <div className="space-y-6">
        <LoadingCard />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部导航栏 */}
      <div className="flex-shrink-0 border-b border-base-300 bg-base-100">
        <div className="flex items-center gap-3 px-6 py-4">
          <button 
            className="btn btn-sm btn-ghost" 
            onClick={handleBack}
            title="返回"
          >
            <HiArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold truncate" title={resource.name}>
            {resource.name}
          </h1>
        </div>
      </div>

      {error && (
        <div className="alert alert-error flex-shrink-0">
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* 左侧：资源信息和预览 */}
        <div className="w-full lg:w-1/3 flex-shrink-0 lg:h-full overflow-auto p-6">
          <ResourceInfoCard
            resource={resource}
            audioSrc={audioSrc}
            onAudioError={(error: string) => setError(error)}
          />
        </div>

        {/* 右侧：转写记录和结果 */}
        <div className="flex-1 lg:h-full overflow-hidden min-w-0 p-6">
          <TranscriptionHistory
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            resultContent={resultContent}
            onSelectTask={setSelectedTaskId}
            onCreateTask={handleShowCreateTaskModal}
            onTaskDeleted={loadTasks}
          />
        </div>
      </div>

      {/* 创建转写任务弹窗 */}
      <CreateTranscriptionTaskModal
        isOpen={showCreateTaskModal}
        onConfirm={handleCreateTask}
        onCancel={() => setShowCreateTaskModal(false)}
      />
    </div>
  );
};

export default ResourceDetailPage;

