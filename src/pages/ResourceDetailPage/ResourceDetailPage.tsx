import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { exists } from '@tauri-apps/plugin-fs';
import { HiArrowLeft } from 'react-icons/hi2';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { setCurrentPage } from '../../redux/slices/featureKeysSlice';
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
  const [resource, setResource] = useState<TranscriptionResource | null>(null);
  const [tasks, setTasks] = useState<TranscriptionTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [resultContent, setResultContent] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);

  // 从 currentPage 中提取 resourceId（格式：resource:${resourceId}）
  const resourceId = currentPage?.startsWith('resource:') ? currentPage.replace('resource:', '') : null;

  useEffect(() => {
    if (resourceId) {
      loadResource();
      loadTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

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
  const loadTasks = async () => {
    if (!resourceId) return;
    try {
      const result = await invoke<TranscriptionTask[]>('get_transcription_tasks', {
        resourceId: resourceId,
      });
      setTasks(result);
      // 默认选择最后一次已完成的任务（按创建时间排序，最新的在前）
      if (result.length > 0) {
        const sortedTasks = [...result].sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        // 优先选择最后一次已完成的任务
        const completedTask = sortedTasks.find(t => t.status === TranscriptionTaskStatus.COMPLETED);
        if (completedTask) {
          setSelectedTaskId(completedTask.id);
        } else if (sortedTasks.length > 0) {
          // 如果没有已完成的任务，选择最后一次的任务
          setSelectedTaskId(sortedTasks[0].id);
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
      setLoading(true);
      setError(null);
      setShowCreateTaskModal(false);

      const task = await invoke<TranscriptionTask>('create_transcription_task', {
        resourceId: resourceId,
        params: params,
      });

      // 执行转写任务
      await invoke<string>('execute_transcription_task', {
        taskId: task.id,
        resourceId: resourceId,
      });

      // 重新加载任务列表
      await loadTasks();
    } catch (err) {
      console.error('创建转写任务失败:', err);
      setError(err instanceof Error ? err.message : '创建转写任务失败');
    } finally {
      setLoading(false);
    }
  };

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

        {/* 右侧：转写历史和结果 */}
        <div className="flex-1 lg:h-full overflow-hidden min-w-0 p-6">
          <TranscriptionHistory
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            loading={loading}
            resultContent={resultContent}
            onSelectTask={setSelectedTaskId}
            onCreateTask={handleShowCreateTaskModal}
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

