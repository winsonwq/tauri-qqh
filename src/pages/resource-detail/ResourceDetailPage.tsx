import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { HiArrowLeft, HiTrash } from 'react-icons/hi2';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { setCurrentPage } from '../../redux/slices/featureKeysSlice';
import { setExtracting } from '../../redux/slices/videoExtractionSlice';
import { setContext, clearContext } from '../../redux/slices/aiContextSlice';
import { useMessage } from '../../components/Toast';
import { EditableInput } from '../../components/EditableInput';
import {
  TranscriptionTask,
  TranscriptionTaskStatus,
  TranscriptionParams,
  ResourceType,
  SourceType,
  Platform,
} from '../../models';
import { isUrl } from '../../utils/urlUtils';
import ResourceInfoCard from './components/ResourceInfoCard';
import TranscriptionHistory from './components/TranscriptionHistory';
import LoadingCard from './components/LoadingCard';
import CreateTranscriptionTaskModal from './components/CreateTranscriptionTaskModal';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import useResourceMedia from './hooks/useResourceMedia';
import useTranscriptionTaskRuntime from './hooks/useTranscriptionTaskRuntime';
import useTranscriptionTasksManager from './hooks/useTranscriptionTasksManager';
import { PlayerRef } from '../../components/Player';

const ResourceDetailPage = () => {
  const dispatch = useAppDispatch();
  const { currentPage } = useAppSelector((state) => state.featureKeys);
  const message = useMessage();
  // 从 currentPage 中提取 resourceId（格式：resource:${resourceId}）
  const resourceId = currentPage?.startsWith('resource:') ? currentPage.replace('resource:', '') : null;
  // 只选择当前资源相关的提取状态，避免整个 videoExtraction 对象变化导致重新渲染
  const isExtracting = useAppSelector(
    (state) => resourceId ? (state.videoExtraction.extractions[resourceId]?.isExtracting ?? false) : false
  );
  const memorizedMessage = useMemo(() => message, [message]);
  const {
    resource,
    audioSrc,
    videoSrc,
    subtitleUrl,
    setResourceData,
    refreshResource,
    refreshSubtitle,
  } = useResourceMedia({ resourceId, message: memorizedMessage });
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const {
    tasks,
    selectedTaskId,
    setSelectedTaskId,
    loadResourceAndTasks,
    loadTasks,
    resetTasks,
    updateTask,
  } = useTranscriptionTasksManager({
    resourceId,
    message,
    setResourceData,
    refreshSubtitle,
    resource,
  });

  const { resultContent, setResultContent, cleanupTaskListeners } =
    useTranscriptionTaskRuntime({
      tasks,
      selectedTaskId,
      dispatch,
    });
  // 用于存储提取事件监听器的清理函数
  const extractionUnlistenRef = useRef<{ log?: UnlistenFn }>({});
  // 用于跟踪是否已经触发过音频提取，避免重复触发
  const extractionTriggeredRef = useRef<Set<string>>(new Set());
  
  // 播放器引用和当前播放时间
  const playerRef = useRef<PlayerRef>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // 使用 useMemo 稳定 hasRunningTask，避免数组引用变化导致频繁触发
  const hasRunningTask = useMemo(() => {
    return tasks.some(
      (task) => task.status === TranscriptionTaskStatus.RUNNING
    );
  }, [tasks]);

  // 轮询任务列表，检测运行中的任务并自动切换
  // 使用 ref 跟踪上一次的状态，避免不必要的轮询
  const previousHasRunningTaskRef = useRef<boolean>(false);
  
  useEffect(() => {
    if (!resourceId) {
      previousHasRunningTaskRef.current = false;
      return;
    }

    // 只有当状态从无运行任务变为有运行任务，或者一直有运行任务时才启动轮询
    if (hasRunningTask) {
      // 如果之前没有运行任务，立即加载一次
      if (!previousHasRunningTaskRef.current) {
        loadTasks(true);
      }
      
      const interval = setInterval(() => {
        loadTasks(true);
      }, 3000); // 增加轮询间隔从 2 秒到 3 秒，减少 API 调用频率

      previousHasRunningTaskRef.current = true;
      
      return () => {
        clearInterval(interval);
        previousHasRunningTaskRef.current = false;
      };
    } else {
      previousHasRunningTaskRef.current = false;
    }
  }, [hasRunningTask, resourceId, loadTasks]);

  // 同步上下文到全局状态
  useEffect(() => {
    dispatch(setContext({
      resourceId: resourceId || null,
      taskId: selectedTaskId || null,
    }));

    // 组件卸载时清除上下文
    return () => {
      dispatch(clearContext());
    };
  }, [dispatch, resourceId, selectedTaskId]);

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
  }, []);

  // 设置提取事件监听器
  const setupExtractionListeners = useCallback(async (resourceId: string) => {
    cleanupExtractionListeners();

    const logEventName = `extraction-log-${resourceId}`;

    try {
      // 监听提取日志
      const unlistenLog = await listen<string>(logEventName, (event) => {
        console.log('提取日志:', event.payload);
      });
      extractionUnlistenRef.current.log = unlistenLog;
    } catch (err) {
      console.error('设置提取监听器失败:', err);
    }
  }, [cleanupExtractionListeners]);

  // 返回列表页
  const handleBack = () => {
    dispatch(setCurrentPage({ feature: 'home', page: null }));
  };

  // 直接创建并执行任务（用于URL资源，不需要参数配置）
  const handleCreateTaskDirectly = useCallback(async () => {
    if (!resourceId) return;
    try {
      // 对于 URL 资源，使用默认参数（实际上这些参数不会被使用，因为会直接下载字幕）
      const defaultParams: TranscriptionParams = {
        model: 'base', // 不会被使用
        language: 'zh',
        word_timestamps: false,
        translate: false,
      };

      // 创建任务
      const task = await invoke<TranscriptionTask>('create_transcription_task', {
        resourceId: resourceId,
        params: defaultParams,
      });

      // 立即切换到新任务并显示 loading
      setSelectedTaskId(task.id);
      setResultContent(null);
      
      // 重新加载任务列表以获取最新状态
      await loadTasks(false);

      // 异步执行转写任务（不阻塞 UI）
      loadTasks(true);
      
      // 执行任务（不等待完成）
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
        cleanupTaskListeners();
        loadTasks(true);
        message.success('字幕下载并转换完成');
      }).catch((err) => {
        console.error('执行转写任务失败:', err);
        message.error(err instanceof Error ? err.message : '执行转写任务失败');
        cleanupTaskListeners();
        loadTasks(true);
      });
      
      // 任务完成后重新加载字幕（loadTasks 内部会自动处理）
    } catch (err) {
      console.error('创建转写任务失败:', err);
      message.error(err instanceof Error ? err.message : '创建转写任务失败');
    }
  }, [resourceId, setSelectedTaskId, setResultContent, loadTasks, cleanupTaskListeners, message]);

  // 显示创建任务弹窗或直接创建任务（URL资源）
  const handleShowCreateTaskModal = useCallback(() => {
    // 如果是 URL 资源（特别是 YouTube），直接创建并执行任务，不需要配置参数
    if (resource?.source_type === SourceType.URL) {
      // 检查是否是 YouTube
      const isYoutube = resource.platform === Platform.YOUTUBE || 
        (resource.file_path.toLowerCase().includes('youtube.com') || 
         resource.file_path.toLowerCase().includes('youtu.be'));
      
      if (isYoutube) {
        // 直接创建并执行任务，使用默认参数（URL资源不需要这些参数）
        handleCreateTaskDirectly();
        return;
      }
    }
    
    // 文件资源需要配置参数，显示弹窗
    setShowCreateTaskModal(true);
  }, [resource, handleCreateTaskDirectly]);

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

  // 更新资源名称
  const handleUpdateResourceName = useCallback(async (newName: string) => {
    if (!resourceId) return;
    try {
      await invoke('update_resource_name', {
        resourceId: resourceId,
        name: newName,
      });
      message.success('资源名称已更新');
      // 刷新资源数据
      await refreshResource();
    } catch (err) {
      console.error('更新资源名称失败:', err);
      message.error(err instanceof Error ? err.message : '更新资源名称失败');
      throw err; // 重新抛出错误，让 EditableInput 保持编辑状态
    }
  }, [resourceId, refreshResource, message]);

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
        cleanupTaskListeners();
        loadTasks(true);
      }).catch((err) => {
        console.error('执行转写任务失败:', err);
        message.error(err instanceof Error ? err.message : '执行转写任务失败');
        cleanupTaskListeners();
        loadTasks(true);
      });
      
      // 任务完成后重新加载字幕（loadTasks 内部会自动处理）
    } catch (err) {
      console.error('创建转写任务失败:', err);
      message.error(err instanceof Error ? err.message : '创建转写任务失败');
    }
  };

  // 监听播放器时间更新
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    
    // 使用轮询方式检查播放器是否已准备好
    const checkPlayer = setInterval(() => {
      if (playerRef.current && !cleanup) {
        cleanup = playerRef.current.onTimeUpdate((time) => {
          setCurrentTime(time);
        });
        clearInterval(checkPlayer);
      }
    }, 100);

    return () => {
      clearInterval(checkPlayer);
      if (cleanup) {
        cleanup();
      }
    };
  }, [audioSrc ?? '', videoSrc ?? '']); // 当音频/视频源变化时重新设置监听，使用空字符串作为默认值确保依赖数组大小一致

  // 组件卸载时清理监听器
  useEffect(() => {
    return () => {
      cleanupTaskListeners();
      cleanupExtractionListeners();
    };
  }, [cleanupExtractionListeners, cleanupTaskListeners]);

  // Effect：当 resourceId 变化时，加载资源和任务
  useEffect(() => {
    // 当 resourceId 变化时，清理所有旧的监听器
    cleanupTaskListeners();
    cleanupExtractionListeners();
    // 清除提取触发标记
    extractionTriggeredRef.current.clear();
    
    if (!resourceId) {
      setResourceData(null);
      resetTasks();
      setResultContent(null);
      return;
    }

    loadResourceAndTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  const handleTaskStopped = useCallback(async () => {
    await loadTasks(false);
    setSelectedTaskId(null);
  }, [loadTasks, setSelectedTaskId]);

  // 稳定 onTaskDeleted 回调，避免 loadTasks 引用变化导致重新渲染
  const handleTaskDeleted = useCallback(async () => {
    await loadTasks(false);
  }, [loadTasks]);

  // 使用 useMemo 稳定资源的关键属性，避免不必要的 effect 触发
  const resourceExtractionKey = useMemo(() => {
    if (!resource) return null;
    return `${resource.id}:${resource.resource_type}:${resource.extracted_audio_path || 'none'}`;
  }, [resource?.id, resource?.resource_type, resource?.extracted_audio_path]);

  // Effect：当资源加载完成且需要提取音频时，触发提取
  // 只依赖 resourceExtractionKey，避免重复触发
  useEffect(() => {
    if (!resourceId || !resource || !resourceExtractionKey) return;
    
    // 只处理视频资源且没有提取音频的情况
    // 使用 resourceExtractionKey 来判断，避免直接依赖 resource 对象
    // resourceExtractionKey 格式: "id:video:none" 或 "id:video:/path/to/audio.wav"
    const isVideoWithoutAudio = resourceExtractionKey.includes(':video:') && resourceExtractionKey.endsWith(':none');
    
    // 检查是否是 URL 资源，URL 资源不需要提取音频（会直接使用 yt-dlp 获取字幕）
    const isUrlResource = resource.source_type === SourceType.URL || isUrl(resource.file_path);
    
    if (isVideoWithoutAudio && !isUrlResource) {
      // 检查是否已经触发过提取（使用 ref 避免重复触发）
      if (extractionTriggeredRef.current.has(resourceId)) {
        return; // 已经触发过，直接返回
      }

      // 检查是否已经在提取中
      if (isExtracting) {
        extractionTriggeredRef.current.add(resourceId);
        return;
      }

      // 标记为已触发（在调用之前就标记，避免并发）
      extractionTriggeredRef.current.add(resourceId);

      // 直接在这里执行提取逻辑，避免依赖 handleAudioExtraction 导致重复触发
      (async () => {
        try {
          // 设置提取事件监听器
          await setupExtractionListeners(resourceId);

          // 显示提示消息并触发提取
          message.info('检测到视频资源，正在自动提取音频...');
          dispatch(setExtracting({ resourceId, isExtracting: true }));
          
          const result = await invoke<string>('extract_audio_from_video', { resourceId });
          
          // 如果返回的是"正在进行中"，不显示成功消息
          if (!result.includes('正在进行中')) {
            message.success('音频提取完成');
          }
          dispatch(setExtracting({ resourceId, isExtracting: false }));
          
          // 重新加载资源数据
          setTimeout(() => {
            refreshResource();
          }, 500);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          if (errorMessage.includes('音频已提取') || 
              errorMessage.includes('正在进行中') ||
              errorMessage.includes('URL资源无需提取音频')) {
            // 这些情况不需要显示错误消息，静默处理
            dispatch(setExtracting({ resourceId, isExtracting: false }));
            setTimeout(() => {
              refreshResource();
            }, 500);
          } else {
            message.error(errorMessage || '音频提取失败');
            dispatch(setExtracting({ resourceId, isExtracting: false }));
            // 提取失败时，清除触发标记，允许重试
            extractionTriggeredRef.current.delete(resourceId);
          }
        }
      })();
    } else {
      // 如果已经有提取的音频，清除触发标记（允许重新加载时重新触发）
      extractionTriggeredRef.current.delete(resourceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, resourceExtractionKey, isExtracting]); // 只依赖 resourceExtractionKey，避免重复触发

  // 计算 canCreateTask，必须在所有早期返回之前
  const canCreateTask = useMemo(() => {
    if (!resource) return true;
    if (resource.resource_type === ResourceType.VIDEO) {
      // URL 资源不需要提取音频，可以直接创建任务
      const isUrlResource = resource.source_type === SourceType.URL || isUrl(resource.file_path);
      if (isUrlResource) {
        return !isExtracting;
      }
      // 文件资源需要先提取音频
      return !!resource.extracted_audio_path && !isExtracting;
    }
    return true;
  }, [resource?.id, resource?.resource_type, resource?.source_type, resource?.file_path, resource?.extracted_audio_path, isExtracting]);

  // 稳定 resourceName，避免 resource 对象引用变化导致重新渲染
  const resourceName = useMemo(() => {
    return resource?.name;
  }, [resource?.name]);

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
          <div className="flex-1 min-w-0">
            <EditableInput
              value={resource.name}
              onSave={handleUpdateResourceName}
              displayClassName="text-lg font-semibold truncate"
              tooltip="点击编辑标题"
              className="w-full"
            />
          </div>
          <button
            className="btn btn-sm btn-error btn-ghost"
            onClick={() => setShowDeleteModal(true)}
            title="删除资源"
          >
            <HiTrash className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* 左侧：资源信息和预览 */}
        <div className="w-full lg:w-1/2 flex-shrink-0 lg:h-full overflow-auto border-r border-base-300 bg-base-100">
          <ResourceInfoCard
            resource={resource}
            audioSrc={audioSrc}
            videoSrc={videoSrc}
            subtitleUrl={subtitleUrl}
            onAudioError={(error: string) => message.error(error)}
            onVideoError={(error: string) => message.error(error)}
            playerRef={playerRef}
            onUpdateName={handleUpdateResourceName}
          />
        </div>

        {/* 右侧：转写记录和结果 */}
        <div className="flex-1 lg:w-1/2 lg:h-full overflow-hidden min-w-0 bg-base-100">
          <TranscriptionHistory
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            resultContent={resultContent}
            resourceName={resourceName}
            canCreateTask={canCreateTask}
            onSelectTask={setSelectedTaskId}
            onCreateTask={handleShowCreateTaskModal}
            onTaskDeleted={handleTaskDeleted}
            onTaskStopped={handleTaskStopped}
            onTaskUpdated={updateTask}
            playerRef={playerRef}
            currentTime={currentTime}
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
