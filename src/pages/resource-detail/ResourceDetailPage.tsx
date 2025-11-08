import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { exists } from '@tauri-apps/plugin-fs';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { HiArrowLeft } from 'react-icons/hi2';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { setCurrentPage } from '../../redux/slices/featureKeysSlice';
import { appendLog } from '../../redux/slices/transcriptionLogsSlice';
import { useMessage } from '../../componets/Toast';
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

const ResourceDetailPage = () => {
  const dispatch = useAppDispatch();
  const { currentPage } = useAppSelector((state) => state.featureKeys);
  const message = useMessage();
  const [resource, setResource] = useState<TranscriptionResource | null>(null);
  const [tasks, setTasks] = useState<TranscriptionTask[]>([]);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [resultContent, setResultContent] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  
  // 用于存储事件监听器的清理函数
  const unlistenRef = useRef<{ stdout?: UnlistenFn; stderr?: UnlistenFn; taskId?: string }>({});
  // 用于跟踪是否正在设置监听器，避免并发调用
  const isSettingUpRef = useRef<boolean>(false);
  // 用于跟踪正在设置的 taskId，防止重复设置
  const settingUpTaskIdRef = useRef<string | null>(null);

  // 从 currentPage 中提取 resourceId（格式：resource:${resourceId}）
  const resourceId = currentPage?.startsWith('resource:') ? currentPage.replace('resource:', '') : null;

  // 清理事件监听器
  const cleanupEventListeners = useCallback(() => {
    console.log('清理事件监听器, 当前 taskId:', unlistenRef.current.taskId);
    if (unlistenRef.current.stdout) {
      try {
        unlistenRef.current.stdout();
        console.log('已清理 stdout 监听器');
      } catch (err) {
        console.error('清理 stdout 监听器失败:', err);
      }
      unlistenRef.current.stdout = undefined;
    }
    if (unlistenRef.current.stderr) {
      try {
        unlistenRef.current.stderr();
        console.log('已清理 stderr 监听器');
      } catch (err) {
        console.error('清理 stderr 监听器失败:', err);
      }
      unlistenRef.current.stderr = undefined;
    }
    unlistenRef.current.taskId = undefined;
    isSettingUpRef.current = false;
    settingUpTaskIdRef.current = null;
  }, []);

  // 为运行中的任务设置事件监听器
  const setupEventListeners = useCallback(async (taskId: string) => {
    // 如果已经在监听这个任务，不需要重复设置
    if (unlistenRef.current.taskId === taskId) {
      console.log('已经在监听该任务，跳过:', taskId);
      return;
    }

    // 如果正在为同一个任务设置监听器，跳过
    if (isSettingUpRef.current && settingUpTaskIdRef.current === taskId) {
      console.log('正在为该任务设置监听器，跳过重复调用:', taskId);
      return;
    }

    // 如果正在为不同任务设置监听器，等待完成（但这种情况应该很少发生）
    if (isSettingUpRef.current && settingUpTaskIdRef.current !== taskId) {
      console.log('正在为其他任务设置监听器，等待完成:', settingUpTaskIdRef.current);
      // 等待一小段时间后重试
      await new Promise(resolve => setTimeout(resolve, 100));
      // 重试前再次检查
      if (unlistenRef.current.taskId === taskId) {
        return;
      }
      if (isSettingUpRef.current && settingUpTaskIdRef.current === taskId) {
        return;
      }
    }

    // 标记正在设置
    isSettingUpRef.current = true;
    settingUpTaskIdRef.current = taskId;

    try {
      // 清理之前的事件监听器
      cleanupEventListeners();

      // 再次检查，防止在清理过程中状态发生变化
      if (unlistenRef.current.taskId === taskId) {
        console.log('清理后发现已经在监听该任务，跳过:', taskId);
        isSettingUpRef.current = false;
        settingUpTaskIdRef.current = null;
        return;
      }

      // 初始化任务的日志数组（确保 Redux 中有该任务的日志数组）
      dispatch(appendLog({ taskId, log: '' }));

      // 设置 stdout 事件监听，将日志存储到 Redux
      const stdoutEventName = `transcription-stdout-${taskId}`;
      console.log('设置 stdout 事件监听器:', stdoutEventName, 'taskId:', taskId);
      try {
        const unlistenStdout = await listen<string>(stdoutEventName, (event) => {
          // 检查是否还在监听这个任务（防止清理后仍然收到事件）
          if (unlistenRef.current.taskId !== taskId) {
            console.log('收到 stdout 事件但任务已切换，忽略:', event.payload, 'taskId:', taskId, '当前 taskId:', unlistenRef.current.taskId);
            return;
          }
          console.log('收到 stdout 事件:', event.payload, 'taskId:', taskId);
          // 将日志存储到 Redux（过滤空字符串）
          if (event.payload.trim()) {
            dispatch(appendLog({ taskId, log: event.payload }));
          }
        });
        unlistenRef.current.stdout = unlistenStdout;
      } catch (err) {
        console.error('设置 stdout 监听器失败:', err);
        isSettingUpRef.current = false;
        settingUpTaskIdRef.current = null;
        return;
      }

      // 设置 stderr 事件监听，将日志存储到 Redux
      const stderrEventName = `transcription-stderr-${taskId}`;
      console.log('设置 stderr 事件监听器:', stderrEventName, 'taskId:', taskId);
      try {
        const unlistenStderr = await listen<string>(stderrEventName, (event) => {
          // 检查是否还在监听这个任务（防止清理后仍然收到事件）
          if (unlistenRef.current.taskId !== taskId) {
            console.log('收到 stderr 事件但任务已切换，忽略:', event.payload, 'taskId:', taskId, '当前 taskId:', unlistenRef.current.taskId);
            return;
          }
          console.log('收到 stderr 事件:', event.payload, 'taskId:', taskId);
          // 将日志存储到 Redux（过滤空字符串）
          if (event.payload.trim()) {
            dispatch(appendLog({ taskId, log: event.payload }));
          }
        });
        unlistenRef.current.stderr = unlistenStderr;
        unlistenRef.current.taskId = taskId;
        isSettingUpRef.current = false;
        settingUpTaskIdRef.current = null;
        console.log('成功设置事件监听器:', taskId);
      } catch (err) {
        console.error('设置 stderr 监听器失败:', err);
        isSettingUpRef.current = false;
        settingUpTaskIdRef.current = null;
      }
    } catch (err) {
      console.error('设置监听器失败:', err);
      isSettingUpRef.current = false;
      settingUpTaskIdRef.current = null;
    }
  }, [cleanupEventListeners, dispatch]);

  useEffect(() => {
    // 当 resourceId 变化时，清理所有旧的监听器
    cleanupEventListeners();
    
    if (resourceId) {
      loadResource();
      loadTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  // 当任务列表加载完成后，检查是否有运行中的任务并设置监听器
  // 注意：这个 useEffect 主要负责清理非运行中任务的监听器
  // 实际的监听器设置由下面的 useEffect 统一处理，避免重复订阅
  useEffect(() => {
    if (tasks.length === 0) return;

    // 检查是否有运行中的任务
    const runningTask = tasks.find(t => t.status === TranscriptionTaskStatus.RUNNING);
    if (!runningTask) {
      // 如果没有运行中的任务，清理监听器
      if (unlistenRef.current.taskId) {
        cleanupEventListeners();
      }
    }
    // 注意：不再在这里设置监听器，统一由下面的 useEffect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

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

  // 当选中任务变化时，自动加载转写结果，并为运行中的任务设置监听器
  // 这是唯一设置监听器的地方，避免重复订阅
  useEffect(() => {
    let isCancelled = false;

    const loadResult = async () => {
      if (!selectedTaskId) {
        setResultContent(null);
        // 清理监听器
        if (unlistenRef.current.taskId) {
          cleanupEventListeners();
        }
        return;
      }
      // 检查任务状态
      const task = tasks.find(t => t.id === selectedTaskId);
      if (!task) {
        setResultContent(null);
        // 清理监听器
        if (unlistenRef.current.taskId) {
          cleanupEventListeners();
        }
        return;
      }

      // 如果任务正在运行，且还没有设置监听器，则设置事件监听器
      if (task.status === TranscriptionTaskStatus.RUNNING) {
        // 检查是否已经取消（组件卸载或状态变化）
        if (isCancelled) return;
        
        // 只有在确实需要设置时才设置（避免重复）
        if (unlistenRef.current.taskId !== task.id && 
            !(isSettingUpRef.current && settingUpTaskIdRef.current === task.id)) {
          await setupEventListeners(task.id);
        }
      } else {
        // 如果任务不是运行中，清理监听器
        if (unlistenRef.current.taskId) {
          cleanupEventListeners();
        }
      }

      // 检查是否已经取消
      if (isCancelled) return;

      // 只有已完成的任务才加载结果
      if (task.status === TranscriptionTaskStatus.COMPLETED) {
        try {
          const content = await invoke<string>('read_transcription_result', { taskId: selectedTaskId });
          if (!isCancelled) {
            setResultContent(content);
          }
        } catch (err) {
          console.error('读取结果失败:', err);
          if (!isCancelled) {
            setResultContent(null);
          }
        }
      } else {
        if (!isCancelled) {
          setResultContent(null);
        }
      }
    };
    
    loadResult();

    // 清理函数：标记为已取消
    return () => {
      isCancelled = true;
    };
  }, [selectedTaskId, tasks, setupEventListeners, cleanupEventListeners]);

  // 加载资源信息
  const loadResource = async () => {
    if (!resourceId) return;
    try {
      const resources = await invoke<TranscriptionResource[]>('get_transcription_resources');
      const found = resources.find((r) => r.id === resourceId);

      if (found) {
        setResource(found);
        
        // 使用前端 fs 插件检查文件是否存在
        try {
          const fileExists = await exists(found.file_path);
          if (!fileExists) {
            message.error(`音频文件不存在: ${found.file_path}`);
            setAudioSrc(null);
            return;
          }
        } catch (err) {
          console.error('检查文件失败:', err);
          message.error(`无法访问音频文件: ${found.file_path}`);
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
          message.error('无法创建音频播放器');
          setAudioSrc(null);
        }
      }
    } catch (err) {
      console.error('加载资源失败:', err);
      message.error(err instanceof Error ? err.message : '加载资源失败');
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

  // 创建转写任务（从弹窗确认后调用）
  const handleCreateTask = async (params: TranscriptionParams) => {
    if (!resourceId) return;
    try {
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

      // 异步执行转写任务（不阻塞 UI）
      // 立即刷新一次任务列表，以获取更新后的 running 状态
      loadTasks(true);
      
      // 执行任务（不等待完成）
      // 注意：监听器会在任务状态变为 RUNNING 后，通过 useEffect 自动设置
      const executePromise = invoke<string>('execute_transcription_task', {
        taskId: task.id,
        resourceId: resourceId,
      });
      
      // 任务开始执行后，短延迟刷新以确保状态已更新为 RUNNING
      setTimeout(() => {
        loadTasks(true);
      }, 200);
      
      // 等待任务完成
      executePromise.then(() => {
        // 执行完成后清理事件监听器
        cleanupEventListeners();
        // 重新加载任务列表（自动切换到已完成的任务）
        loadTasks(true);
      }).catch((err) => {
        console.error('执行转写任务失败:', err);
        message.error(err instanceof Error ? err.message : '执行转写任务失败');
        // 清理事件监听器
        cleanupEventListeners();
        // 即使失败也要重新加载任务列表以更新状态
        loadTasks(true);
      });
    } catch (err) {
      console.error('创建转写任务失败:', err);
      message.error(err instanceof Error ? err.message : '创建转写任务失败');
    }
  };

  // 组件卸载时清理事件监听器
  useEffect(() => {
    return () => {
      // 组件卸载时，确保清理所有监听器
      if (unlistenRef.current.stdout) {
        unlistenRef.current.stdout();
      }
      if (unlistenRef.current.stderr) {
        unlistenRef.current.stderr();
      }
      unlistenRef.current.stdout = undefined;
      unlistenRef.current.stderr = undefined;
      unlistenRef.current.taskId = undefined;
      isSettingUpRef.current = false;
      settingUpTaskIdRef.current = null;
    };
  }, []);

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

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* 左侧：资源信息和预览 */}
        <div className="w-full lg:w-2/5 flex-shrink-0 lg:h-full overflow-auto border-r border-base-300 bg-base-100">
          <ResourceInfoCard
            resource={resource}
            audioSrc={audioSrc}
            onAudioError={(error: string) => message.error(error)}
          />
        </div>

        {/* 右侧：转写记录和结果 */}
        <div className="flex-1 lg:h-full overflow-hidden min-w-0 bg-base-100">
          <TranscriptionHistory
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            resultContent={resultContent}
            onSelectTask={setSelectedTaskId}
            onCreateTask={handleShowCreateTaskModal}
            onTaskDeleted={loadTasks}
            onTaskStopped={loadTasks}
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

