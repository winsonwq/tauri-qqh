import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { exists } from '@tauri-apps/plugin-fs';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { HiArrowLeft } from 'react-icons/hi2';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { setCurrentPage } from '../../redux/slices/featureKeysSlice';
import { appendLog } from '../../redux/slices/transcriptionLogsSlice';
import { setExtracting, setProgress } from '../../redux/slices/videoExtractionSlice';
import { useMessage } from '../../componets/Toast';
import {
  TranscriptionResource,
  TranscriptionTask,
  TranscriptionTaskStatus,
  TranscriptionParams,
  ResourceType,
} from '../../models';
import { loadSubtitleFromTasks } from '../../utils/subtitleUtils';
import ResourceInfoCard from './components/ResourceInfoCard';
import TranscriptionHistory from './components/TranscriptionHistory';
import LoadingCard from './components/LoadingCard';
import CreateTranscriptionTaskModal from './components/CreateTranscriptionTaskModal';
import DeleteConfirmModal from '../../componets/DeleteConfirmModal';

const ResourceDetailPage = () => {
  const dispatch = useAppDispatch();
  const { currentPage } = useAppSelector((state) => state.featureKeys);
  const videoExtraction = useAppSelector((state) => state.videoExtraction);
  const message = useMessage();
  const [resource, setResource] = useState<TranscriptionResource | null>(null);
  const [tasks, setTasks] = useState<TranscriptionTask[]>([]);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [resultContent, setResultContent] = useState<string | null>(null);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null); // WebVTT 字幕的 URL
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // 用于存储事件监听器的清理函数
  const unlistenRef = useRef<{ stdout?: UnlistenFn; stderr?: UnlistenFn; taskId?: string }>({});
  // 用于跟踪是否正在设置监听器，避免并发调用
  const isSettingUpRef = useRef<boolean>(false);
  // 用于跟踪正在设置的 taskId，防止重复设置
  const settingUpTaskIdRef = useRef<string | null>(null);
  // 用于存储提取事件监听器的清理函数
  const extractionUnlistenRef = useRef<{ log?: UnlistenFn; progress?: UnlistenFn }>({});

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
    cleanupExtractionListeners();
    
    if (resourceId) {
      loadResourceAndTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  // 当任务列表加载完成后，检查是否有运行中的任务并设置监听器
  // 注意：这个 useEffect 主要负责清理非运行中任务的监听器
  // 实际的监听器设置由下面的 useEffect 统一处理，避免重复订阅
  // 使用 useMemo 来稳定 runningTaskId 的引用，只依赖关键字段
  const runningTaskId = useMemo(() => {
    const runningTask = tasks.find(t => t.status === TranscriptionTaskStatus.RUNNING);
    return runningTask?.id ?? null;
  }, [tasks.map(t => `${t.id}:${t.status}`).join(',')]); // 只依赖任务 id 和 status 的组合字符串
  
  useEffect(() => {
    if (tasks.length === 0) return;

    if (!runningTaskId) {
      // 如果没有运行中的任务，清理监听器
      if (unlistenRef.current.taskId) {
        cleanupEventListeners();
      }
    }
    // 注意：不再在这里设置监听器，统一由下面的 useEffect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningTaskId, tasks.length]); // 只依赖 runningTaskId 和 tasks.length

  // 轮询任务列表，检测运行中的任务并自动切换
  // 使用 ref 来跟踪是否有运行中的任务，避免频繁重新创建 interval
  const hasRunningTaskRef = useRef(false);
  useEffect(() => {
    if (!resourceId) return;

    // 检查是否有运行中的任务
    const hasRunningTask = tasks.some(t => t.status === TranscriptionTaskStatus.RUNNING);
    
    // 只在状态变化时更新 ref
    if (hasRunningTaskRef.current !== hasRunningTask) {
      hasRunningTaskRef.current = hasRunningTask;
    }
    
    if (hasRunningTask) {
      // 如果有运行中的任务，每 2 秒刷新一次任务列表（降低频率减少闪烁）
      const interval = setInterval(() => {
        loadTasks(true); // 自动切换到运行中的任务
      }, 2000);

      return () => {
        clearInterval(interval);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.length, resourceId]); // 只依赖 tasks.length，而不是整个 tasks 数组

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

  // 清理提取事件监听器
  const cleanupExtractionListeners = useCallback(() => {
    if (extractionUnlistenRef.current.log) {
      try {
        extractionUnlistenRef.current.log();
      } catch (err) {
        console.error('清理提取日志监听器失败:', err);
      }
      extractionUnlistenRef.current.log = undefined;
    }
    if (extractionUnlistenRef.current.progress) {
      try {
        extractionUnlistenRef.current.progress();
      } catch (err) {
        console.error('清理提取进度监听器失败:', err);
      }
      extractionUnlistenRef.current.progress = undefined;
    }
  }, []);

  // 设置提取事件监听器
  const setupExtractionListeners = useCallback(async (resourceId: string) => {
    cleanupExtractionListeners();

    const logEventName = `extraction-log-${resourceId}`;
    const progressEventName = `extraction-progress-${resourceId}`;

    try {
      // 监听提取日志
      const unlistenLog = await listen<string>(logEventName, (event) => {
        console.log('提取日志:', event.payload);
      });
      extractionUnlistenRef.current.log = unlistenLog;

      // 监听提取进度
      const unlistenProgress = await listen<number>(progressEventName, (event) => {
        console.log('提取进度:', event.payload);
        dispatch(setProgress({ resourceId, progress: event.payload }));
      });
      extractionUnlistenRef.current.progress = unlistenProgress;
    } catch (err) {
      console.error('设置提取监听器失败:', err);
    }
  }, [cleanupExtractionListeners, dispatch]);

  // 初始化加载：同时加载资源和任务，完成后处理字幕
  const loadResourceAndTasks = async () => {
    if (!resourceId) return;
    
    try {
      // 并行加载资源和任务
      const [resources, tasksResult] = await Promise.all([
        invoke<TranscriptionResource[]>('get_transcription_resources'),
        invoke<TranscriptionTask[]>('get_transcription_tasks', { resourceId }),
      ]);
      
      // 处理资源
      const found = resources.find((r) => r.id === resourceId);
      if (found) {
        setResource(found);
        await initializeResource(found);
      }
      
      // 处理任务
      initializeTasks(tasksResult);
      
      // 加载字幕（仅在视频资源时，此时 resource 和 tasks 都已加载完成）
      await initializeSubtitle(found, tasksResult);
    } catch (err) {
      console.error('加载资源和任务失败:', err);
      message.error(err instanceof Error ? err.message : '加载失败');
      setAudioSrc(null);
      setVideoSrc(null);
    }
  };

  // 加载资源信息（用于重新加载，比如音频提取后）
  const loadResource = async () => {
    if (!resourceId) return;
    try {
      const resources = await invoke<TranscriptionResource[]>('get_transcription_resources');
      const found = resources.find((r) => r.id === resourceId);

      if (found) {
        setResource(found);
        // 复用初始化函数
        await initializeResource(found);
      }
    } catch (err) {
      console.error('加载资源失败:', err);
      message.error(err instanceof Error ? err.message : '加载资源失败');
      setAudioSrc(null);
      setVideoSrc(null);
    }
  };

  // 初始化资源：设置播放源、音频提取等
  const initializeResource = useCallback(async (found: TranscriptionResource) => {
    if (!resourceId) return;
    
    // 使用前端 fs 插件检查文件是否存在
    try {
      const fileExists = await exists(found.file_path);
      if (!fileExists) {
        message.error(`文件不存在: ${found.file_path}`);
        setAudioSrc(null);
        setVideoSrc(null);
        return;
      }
    } catch (err) {
      console.error('检查文件失败:', err);
      message.error(`无法访问文件: ${found.file_path}`);
      setAudioSrc(null);
      setVideoSrc(null);
      return;
    }
    
    // 根据资源类型设置播放源
    if (found.resource_type === ResourceType.VIDEO) {
      // 视频资源：显示视频文件
      try {
        const videoPath = convertFileSrc(found.file_path);
        console.log('视频原始路径:', found.file_path);
        console.log('视频转换后路径:', videoPath);
        setVideoSrc(videoPath);
        setAudioSrc(null);
      } catch (err) {
        console.error('转换视频路径失败:', err);
        message.error('无法创建视频播放器');
        setVideoSrc(null);
      }

      // 设置提取事件监听器
      await setupExtractionListeners(resourceId);

      // 检查是否需要提取音频
      if (!found.extracted_audio_path) {
        // 自动触发音频提取
        dispatch(setExtracting({ resourceId, isExtracting: true }));
        dispatch(setProgress({ resourceId, progress: 0 }));
        
        invoke<string>('extract_audio_from_video', { resourceId })
          .then((result) => {
            console.log('音频提取成功:', result);
            dispatch(setExtracting({ resourceId, isExtracting: false }));
            dispatch(setProgress({ resourceId, progress: 100 }));
            // 重新加载资源以获取提取的音频路径
            setTimeout(() => {
              loadResource().catch((err) => {
                console.error('重新加载资源失败:', err);
              });
            }, 500);
          })
          .catch((err) => {
            console.error('音频提取失败:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (errorMessage.includes('音频已提取') || errorMessage.includes('正在进行中')) {
              console.log('音频提取状态:', errorMessage);
              dispatch(setExtracting({ resourceId, isExtracting: false }));
              dispatch(setProgress({ resourceId, progress: 100 }));
              setTimeout(() => {
                loadResource().catch((loadErr) => {
                  console.error('重新加载资源失败:', loadErr);
                });
              }, 500);
            } else {
              message.error(errorMessage || '音频提取失败');
              dispatch(setExtracting({ resourceId, isExtracting: false }));
            }
          });
      } else {
        // 如果已有提取的音频路径，检查文件是否存在
        try {
          const audioExists = await exists(found.extracted_audio_path);
          if (audioExists) {
            try {
              const audioPath = convertFileSrc(found.extracted_audio_path);
              setAudioSrc(audioPath);
              console.log('提取的音频文件已加载:', audioPath);
            } catch (convertErr) {
              console.error('转换提取的音频路径失败:', convertErr);
            }
          } else {
            console.warn('提取的音频文件不存在:', found.extracted_audio_path);
          }
        } catch (err) {
          console.error('检查提取的音频文件失败:', err);
        }
      }
    } else {
      // 音频资源：显示音频文件
      try {
        const audioPath = convertFileSrc(found.file_path);
        console.log('音频原始路径:', found.file_path);
        console.log('音频转换后路径:', audioPath);
        setAudioSrc(audioPath);
        setVideoSrc(null);
      } catch (err) {
        console.error('转换音频路径失败:', err);
        message.error('无法创建音频播放器');
        setAudioSrc(null);
      }
    }
  }, [resourceId, dispatch, setupExtractionListeners]);

  // 初始化任务：选择任务
  const initializeTasks = useCallback((tasksResult: TranscriptionTask[]) => {
    const sortedTasks = [...tasksResult].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    setTasks(tasksResult);
    
    // 选择任务的优先级
    if (sortedTasks.length > 0) {
      const runningTask = sortedTasks.find(t => t.status === TranscriptionTaskStatus.RUNNING);
      if (runningTask) {
        setSelectedTaskId(runningTask.id);
      } else {
        const completedTask = sortedTasks.find(t => t.status === TranscriptionTaskStatus.COMPLETED);
        if (completedTask) {
          setSelectedTaskId(completedTask.id);
        } else {
          setSelectedTaskId(sortedTasks[0].id);
        }
      }
    }
  }, []);

  // 初始化字幕：加载字幕（仅在视频资源时）
  const initializeSubtitle = useCallback(async (
    found: TranscriptionResource | undefined,
    tasksResult: TranscriptionTask[]
  ) => {
    if (found?.resource_type === ResourceType.VIDEO && resourceId && tasksResult.length > 0) {
      const newSubtitleUrl = await loadSubtitleFromTasks(tasksResult);
      setSubtitleUrl(newSubtitleUrl);
    }
  }, [resourceId]);

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
      
      // 复用初始化函数处理任务
      initializeTasks(result);
      
      // 复用初始化函数加载字幕
      await initializeSubtitle(resource || undefined, result);
      
      // 选择任务的优先级（仅在 autoSwitchToRunning 为 true 时自动切换）
      if (sortedTasks.length > 0 && autoSwitchToRunning) {
        const runningTask = sortedTasks.find(t => t.status === TranscriptionTaskStatus.RUNNING);
        if (runningTask) {
          // 检查是否是新出现的运行任务，或者当前选中的任务不是运行中的
          const previousRunningTask = previousTasks.find(t => t.id === runningTask.id);
          const isNewRunningTask = !previousRunningTask || previousRunningTask.status !== TranscriptionTaskStatus.RUNNING;
          const currentTaskIsNotRunning = !selectedTaskId || 
            !previousTasks.find(t => t.id === selectedTaskId && t.status === TranscriptionTaskStatus.RUNNING);
          
          // 如果是新出现的运行任务，或者当前选中的任务不是运行中的，则切换到运行中的任务
          if (isNewRunningTask || currentTaskIsNotRunning) {
            setSelectedTaskId(runningTask.id);
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

  // 删除资源
  const handleDeleteResource = async () => {
    if (!resourceId) return;
    try {
      await invoke('delete_transcription_resource', { resourceId: resourceId });
      message.success('资源已删除');
      setShowDeleteModal(false);
      // 返回列表页
      dispatch(setCurrentPage({ feature: 'home', page: null }));
    } catch (err) {
      console.error('删除资源失败:', err);
      message.error(err instanceof Error ? err.message : '删除资源失败');
    }
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
      
      // 任务完成后重新加载字幕（loadTasks 内部会自动处理）
    } catch (err) {
      console.error('创建转写任务失败:', err);
      message.error(err instanceof Error ? err.message : '创建转写任务失败');
    }
  };

  // 组件卸载时清理事件监听器和 Blob URL
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
      cleanupExtractionListeners();
    };
  }, [cleanupExtractionListeners]);

  // 计算 canCreateTask，必须在所有早期返回之前
  const canCreateTask = useMemo(() => {
    if (!resource) return true;
    if (resource.resource_type === ResourceType.VIDEO) {
      return !!resource.extracted_audio_path &&
        !videoExtraction.extractions[resource.id]?.isExtracting;
    }
    return true;
  }, [resource?.id, resource?.resource_type, resource?.extracted_audio_path, videoExtraction.extractions[resource?.id || '']?.isExtracting]);

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
            videoSrc={videoSrc}
            subtitleUrl={subtitleUrl}
            onAudioError={(error: string) => message.error(error)}
            onVideoError={(error: string) => message.error(error)}
            onDelete={() => setShowDeleteModal(true)}
          />
        </div>

        {/* 右侧：转写记录和结果 */}
        <div className="flex-1 lg:h-full overflow-hidden min-w-0 bg-base-100">
          <TranscriptionHistory
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            resultContent={resultContent}
            resourceName={resource?.name}
            canCreateTask={canCreateTask}
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

      {/* 删除资源确认弹窗 */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        title="删除资源"
        message="确定要删除这个资源吗？删除后无法恢复，相关的转写任务将保留。"
        onConfirm={handleDeleteResource}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
};

export default ResourceDetailPage;

