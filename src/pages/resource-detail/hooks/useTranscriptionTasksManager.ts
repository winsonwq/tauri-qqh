import {
  Dispatch,
  SetStateAction,
  useCallback,
  useState,
  useRef,
  useEffect,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  TranscriptionResource,
  TranscriptionTask,
  TranscriptionTaskStatus,
} from '../../../models';
import { MessageApi } from './useResourceMedia';

type UseTranscriptionTasksManagerParams = {
  resourceId: string | null;
  message: MessageApi;
  setResourceData: (resource: TranscriptionResource | null) => Promise<void>;
  refreshSubtitle: (
    tasks: TranscriptionTask[],
    resourceOverride?: TranscriptionResource | null
  ) => Promise<void>;
  resource: TranscriptionResource | null;
};

type UseTranscriptionTasksManagerResult = {
  tasks: TranscriptionTask[];
  selectedTaskId: string | null;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  loadResourceAndTasks: () => Promise<void>;
  loadTasks: (autoSwitchToRunning?: boolean) => Promise<void>;
  resetTasks: () => void;
};

const useTranscriptionTasksManager = ({
  resourceId,
  message,
  setResourceData,
  refreshSubtitle,
  resource,
}: UseTranscriptionTasksManagerParams): UseTranscriptionTasksManagerResult => {
  const [tasks, setTasks] = useState<TranscriptionTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const applyTasks = useCallback(
    (tasksResult: TranscriptionTask[], selectDefault = false) => {
      const sortedTasks = [...tasksResult].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setTasks((prevTasks) => {
        // 只有当任务列表实际发生变化时才更新状态，避免不必要的重新渲染
        if (
          prevTasks.length === sortedTasks.length &&
          prevTasks.every(
            (prevTask, index) =>
              prevTask.id === sortedTasks[index].id &&
              prevTask.status === sortedTasks[index].status
          )
        ) {
          return prevTasks;
        }
        return sortedTasks;
      });

      if (selectDefault) {
        if (sortedTasks.length === 0) {
          setSelectedTaskId(null);
          return sortedTasks;
        }
        const runningTask = sortedTasks.find(
          (task) => task.status === TranscriptionTaskStatus.RUNNING
        );
        if (runningTask) {
          setSelectedTaskId(runningTask.id);
          return sortedTasks;
        }
        const completedTask = sortedTasks.find(
          (task) => task.status === TranscriptionTaskStatus.COMPLETED
        );
        if (completedTask) {
          setSelectedTaskId(completedTask.id);
          return sortedTasks;
        }
        setSelectedTaskId(sortedTasks[0].id);
      }

      return sortedTasks;
    },
    []
  );

  const loadResourceAndTasks = useCallback(async () => {
    if (!resourceId) return;

    try {
      const [resources, tasksResult] = await Promise.all([
        invoke<TranscriptionResource[]>('get_transcription_resources'),
        invoke<TranscriptionTask[]>('get_transcription_tasks', { resourceId }),
      ]);

      const found = resources.find((item) => item.id === resourceId) || null;
      await setResourceData(found);

      const sortedTasks = applyTasks(tasksResult, true);
      await refreshSubtitle(sortedTasks, found);
    } catch (err) {
      console.error('加载资源和任务失败:', err);
      message.error(err instanceof Error ? err.message : '加载失败');
      await setResourceData(null);
      applyTasks([], true);
    }
  }, [
    resourceId,
    applyTasks,
    message,
    refreshSubtitle,
    setResourceData,
  ]);

  // 使用 ref 存储 tasks，避免循环依赖
  const tasksRef = useRef<TranscriptionTask[]>([]);
  const selectedTaskIdRef = useRef<string | null>(null);
  const resourceRef = useRef<TranscriptionResource | null>(null);
  
  // 同步 ref 和 state
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  
  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId;
  }, [selectedTaskId]);

  useEffect(() => {
    resourceRef.current = resource;
  }, [resource]);

  const loadTasks = useCallback(
    async (autoSwitchToRunning = true) => {
      if (!resourceId) return;
      try {
        const result = await invoke<TranscriptionTask[]>(
          'get_transcription_tasks',
          { resourceId }
        );

        const previousTasks = tasksRef.current;

        const sortedTasks = applyTasks(result, true);

        // 使用 resourceRef 避免依赖 resource 对象引用
        await refreshSubtitle(sortedTasks, resourceRef.current ?? null);

        // 如果传入了 autoSwitchToRunning 并且有任务正在运行，则尝试自动切换到运行中的任务
        if (autoSwitchToRunning) {
          if (sortedTasks.length > 0) {
            const runningTask = sortedTasks.find(
              (task) => task.status === TranscriptionTaskStatus.RUNNING
            );
            if (runningTask) {
              const previousRunningTask = previousTasks.find(
                (task) => task.id === runningTask.id
              );
              const isNewRunningTask =
                !previousRunningTask ||
                previousRunningTask.status !== TranscriptionTaskStatus.RUNNING;
              const currentTaskIsNotRunning =
                !selectedTaskIdRef.current ||
                !previousTasks.find(
                  (task) =>
                    task.id === selectedTaskIdRef.current &&
                    task.status === TranscriptionTaskStatus.RUNNING
                );

              if (isNewRunningTask || currentTaskIsNotRunning) {
                setSelectedTaskId(runningTask.id);
              }
            }
          }
        } else {
          // 如果不自动切换，但当前选中的任务已经停止或完成，则清除选中状态
          const currentSelectedTask = sortedTasks.find(t => t.id === selectedTaskIdRef.current);
          if (currentSelectedTask && 
             (currentSelectedTask.status === TranscriptionTaskStatus.STOPPED || 
              currentSelectedTask.status === TranscriptionTaskStatus.COMPLETED || 
              currentSelectedTask.status === TranscriptionTaskStatus.FAILED)) {
            setSelectedTaskId(null);
          }
        }
      } catch (err) {
        console.error('加载任务失败:', err);
      }
    },
    [
      resourceId,
      applyTasks,
      refreshSubtitle,
      // 移除 resource 依赖，使用 resourceRef 代替
    ]
  );

  const resetTasks = useCallback(() => {
    setTasks([]);
    setSelectedTaskId(null);
  }, []);

  return {
    tasks,
    selectedTaskId,
    setSelectedTaskId,
    loadResourceAndTasks,
    loadTasks,
    resetTasks,
  };
};

export default useTranscriptionTasksManager;


