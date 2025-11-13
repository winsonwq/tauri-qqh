import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { TranscriptionTask, TranscriptionTaskStatus } from '../../../models'
import { appendLog } from '../../../redux/slices/transcriptionLogsSlice'
import { AppDispatch } from '../../../redux/store'

type UseTranscriptionTaskRuntimeParams = {
  tasks: TranscriptionTask[]
  selectedTaskId: string | null
  dispatch: AppDispatch
}

type UseTranscriptionTaskRuntimeResult = {
  resultContent: string | null
  setResultContent: Dispatch<SetStateAction<string | null>>
  cleanupTaskListeners: () => void
}

const useTranscriptionTaskRuntime = ({
  tasks,
  selectedTaskId,
  dispatch,
}: UseTranscriptionTaskRuntimeParams): UseTranscriptionTaskRuntimeResult => {
  const [resultContent, setResultContent] = useState<string | null>(null)

  const unlistenRef = useRef<{
    stdout?: UnlistenFn
    stderr?: UnlistenFn
    taskId?: string
  }>({})
  const isSettingUpRef = useRef<boolean>(false)
  const settingUpTaskIdRef = useRef<string | null>(null)

  const cleanupTaskListeners = useCallback(() => {
    // 如果正在设置中，不清理（避免在设置过程中被清理）
    if (isSettingUpRef.current) {
      console.log('[cleanupTaskListeners] 正在设置中，跳过清理')
      return
    }
    // 如果已经清理过了，直接返回
    if (!unlistenRef.current.stdout && !unlistenRef.current.stderr && !unlistenRef.current.taskId) {
      return
    }
    console.log('[cleanupTaskListeners] 开始清理，当前 taskId:', unlistenRef.current.taskId)
    if (unlistenRef.current.stdout) {
      try {
        unlistenRef.current.stdout()
        console.log('[cleanupTaskListeners] stdout 监听器已清理')
      } catch (err) {
        console.error('清理 stdout 监听器失败:', err)
      }
      unlistenRef.current.stdout = undefined
    }
    if (unlistenRef.current.stderr) {
      try {
        unlistenRef.current.stderr()
        console.log('[cleanupTaskListeners] stderr 监听器已清理')
      } catch (err) {
        console.error('清理 stderr 监听器失败:', err)
      }
      unlistenRef.current.stderr = undefined
    }
    unlistenRef.current.taskId = undefined
    isSettingUpRef.current = false
    settingUpTaskIdRef.current = null
  }, [])

  const setupTaskListeners = useCallback(
    async (taskId: string) => {
      // 如果已经在设置这个任务，直接返回
      if (isSettingUpRef.current && settingUpTaskIdRef.current === taskId) {
        console.log('[setupTaskListeners] 已经在设置这个任务，跳过')
        return
      }
      
      try {
        console.log('[setupTaskListeners] 开始设置监听器，taskId:', taskId)
        // 设置标志，防止在设置过程中被清理
        isSettingUpRef.current = true
        settingUpTaskIdRef.current = taskId
        
        // 先清理旧的监听器（但不会清理，因为 isSettingUpRef.current 已经是 true）
        // 所以我们需要手动清理旧的监听器
        if (unlistenRef.current.stdout) {
          try {
            unlistenRef.current.stdout()
            console.log('[setupTaskListeners] 清理旧的 stdout 监听器')
          } catch (err) {
            console.error('清理旧的 stdout 监听器失败:', err)
          }
          unlistenRef.current.stdout = undefined
        }
        if (unlistenRef.current.stderr) {
          try {
            unlistenRef.current.stderr()
            console.log('[setupTaskListeners] 清理旧的 stderr 监听器')
          } catch (err) {
            console.error('清理旧的 stderr 监听器失败:', err)
          }
          unlistenRef.current.stderr = undefined
        }
        
        // 设置 taskId，这样回调函数可以检查
        unlistenRef.current.taskId = taskId

        const stdoutEventName = `transcription-stdout-${taskId}`
        console.log('[setupTaskListeners] 监听事件:', stdoutEventName)
        let stdoutSetupSuccess = false
        try {
          // 使用闭包捕获 taskId，确保回调函数中使用的 taskId 是正确的
          const capturedTaskId = taskId
          const unlistenStdout = await listen<string>(
            stdoutEventName,
            (event) => {
              console.log('[事件回调] 收到 stdout 事件，taskId:', capturedTaskId, 'payload:', event.payload?.substring(0, 100))
              // 检查当前监听器是否还是这个任务
              if (unlistenRef.current.taskId !== capturedTaskId) {
                console.log('[事件回调] taskId 不匹配，当前:', unlistenRef.current.taskId, '期望:', capturedTaskId, '忽略事件')
                return
              }
              const payload = typeof event.payload === 'string' ? event.payload : String(event.payload || '')
              if (payload.trim()) {
                console.log('[事件回调] 处理 payload，长度:', payload.length)
                dispatch(appendLog({ taskId: capturedTaskId, log: payload }))
              }
            },
          )
          console.log('[setupTaskListeners] stdout 监听器设置成功，unlisten 函数:', typeof unlistenStdout)
          unlistenRef.current.stdout = unlistenStdout
          stdoutSetupSuccess = true
        } catch (err) {
          console.error('[setupTaskListeners] 设置 stdout 监听器失败:', err)
          // 清理已设置的部分
          unlistenRef.current.taskId = undefined
          isSettingUpRef.current = false
          settingUpTaskIdRef.current = null
          return
        }

        const stderrEventName = `transcription-stderr-${taskId}`
        console.log('[setupTaskListeners] 监听事件:', stderrEventName)
        try {
          // 使用闭包捕获 taskId
          const capturedTaskId = taskId
          const unlistenStderr = await listen<string>(
            stderrEventName,
            (event) => {
              console.log('[事件回调] 收到 stderr 事件，taskId:', capturedTaskId, 'payload:', event.payload?.substring(0, 100))
              // 检查当前监听器是否还是这个任务
              if (unlistenRef.current.taskId !== capturedTaskId) {
                console.log('[事件回调] stderr taskId 不匹配，当前:', unlistenRef.current.taskId, '期望:', capturedTaskId, '忽略事件')
                return
              }
              const payload = typeof event.payload === 'string' ? event.payload : String(event.payload || '')
              if (payload.trim()) {
                dispatch(appendLog({ taskId: capturedTaskId, log: payload }))
              }
            },
          )
          console.log('[setupTaskListeners] stderr 监听器设置成功，unlisten 函数:', typeof unlistenStderr)
          unlistenRef.current.stderr = unlistenStderr
        } catch (err) {
          console.error('[setupTaskListeners] 设置 stderr 监听器失败:', err)
          // 如果 stdout 设置成功但 stderr 失败，清理 stdout
          if (stdoutSetupSuccess && unlistenRef.current.stdout) {
            try {
              unlistenRef.current.stdout()
            } catch (e) {
              console.error('清理 stdout 监听器失败:', e)
            }
            unlistenRef.current.stdout = undefined
          }
          unlistenRef.current.taskId = undefined
          isSettingUpRef.current = false
          settingUpTaskIdRef.current = null
          return
        }

        // 设置完成，清除设置标志
        isSettingUpRef.current = false
        settingUpTaskIdRef.current = null
        console.log('[setupTaskListeners] 监听器设置完成，taskId:', taskId, 'stdout:', !!unlistenRef.current.stdout, 'stderr:', !!unlistenRef.current.stderr)
      } catch (err) {
        console.error('[setupTaskListeners] 设置监听器失败:', err)
        // 确保清理所有状态
        if (unlistenRef.current.stdout) {
          try {
            unlistenRef.current.stdout()
          } catch (e) {
            console.error('清理 stdout 监听器失败:', e)
          }
          unlistenRef.current.stdout = undefined
        }
        if (unlistenRef.current.stderr) {
          try {
            unlistenRef.current.stderr()
          } catch (e) {
            console.error('清理 stderr 监听器失败:', e)
          }
          unlistenRef.current.stderr = undefined
        }
        unlistenRef.current.taskId = undefined
        isSettingUpRef.current = false
        settingUpTaskIdRef.current = null
      }
    },
    [dispatch],
  )

  // 使用 useMemo 稳定 runningTaskId，避免数组引用变化导致频繁触发
  const runningTaskId = useMemo(() => {
    const runningTask = tasks.find(
      (task) => task.status === TranscriptionTaskStatus.RUNNING,
    )
    return runningTask?.id ?? null
  }, [tasks])

  // 使用 ref 跟踪上一次的 runningTaskId，避免不必要的清理
  const previousRunningTaskIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (tasks.length === 0) {
      previousRunningTaskIdRef.current = null
      return
    }
    // 只有当 runningTaskId 从有值变为 null 时才清理
    // 并且当前监听器的 taskId 匹配之前的 runningTaskId
    if (
      !runningTaskId &&
      previousRunningTaskIdRef.current &&
      unlistenRef.current.taskId === previousRunningTaskIdRef.current
    ) {
      console.log('[runningTaskId effect] 运行任务结束，清理监听器')
      cleanupTaskListeners()
    }
    previousRunningTaskIdRef.current = runningTaskId
  }, [runningTaskId, tasks.length, cleanupTaskListeners])

  // 使用 useMemo 稳定 selectedTask，避免 tasks 数组引用变化导致频繁触发
  // 但只使用 selectedTaskId 和 status，不依赖整个对象引用
  const selectedTaskStatus = useMemo(() => {
    if (!selectedTaskId) return null
    const task = tasks.find((item) => item.id === selectedTaskId)
    return task?.status ?? null
  }, [selectedTaskId, tasks])

  // 使用 ref 跟踪上一次的 selectedTaskId 和 status，避免不必要的清理
  const previousSelectedTaskIdRef = useRef<string | null>(null)
  const previousSelectedTaskStatusRef = useRef<TranscriptionTaskStatus | null>(null)

  useEffect(() => {
    let isCancelled = false

    const loadResult = async () => {
      if (!selectedTaskId) {
        // 只有当之前有选中任务时才清理
        if (previousSelectedTaskIdRef.current) {
          console.log('[loadResult] 没有选中任务，清理监听器')
          cleanupTaskListeners()
        }
        setResultContent(null)
        previousSelectedTaskIdRef.current = null
        previousSelectedTaskStatusRef.current = null
        return
      }

      // 如果 selectedTaskStatus 为 null，说明任务不存在
      if (!selectedTaskStatus) {
        // 任务不存在，清理监听器
        if (previousSelectedTaskIdRef.current) {
          console.log('[loadResult] 任务不存在，清理监听器')
          cleanupTaskListeners()
        }
        setResultContent(null)
        previousSelectedTaskIdRef.current = null
        previousSelectedTaskStatusRef.current = null
        return
      }

      const taskIdChanged = previousSelectedTaskIdRef.current !== selectedTaskId
      const statusChanged = previousSelectedTaskStatusRef.current !== selectedTaskStatus

      // 如果任务 ID 或状态发生变化，或者需要检查监听器状态，才需要处理
      const needsProcessing = taskIdChanged || statusChanged || 
        (selectedTaskStatus === TranscriptionTaskStatus.RUNNING && 
         (!unlistenRef.current.taskId || unlistenRef.current.taskId !== selectedTaskId))

      if (needsProcessing) {
        console.log('[loadResult] 任务变化，taskId:', selectedTaskId, 'status:', selectedTaskStatus, 'taskIdChanged:', taskIdChanged, 'statusChanged:', statusChanged, 'needsProcessing:', needsProcessing)

        if (selectedTaskStatus === TranscriptionTaskStatus.RUNNING) {
          if (isCancelled) return
          // 只有当没有监听器，或者当前监听器不是这个任务的，才设置新的监听器
          console.log('[loadResult] 任务运行中，当前监听器 taskId:', unlistenRef.current.taskId, '选中任务 id:', selectedTaskId)
          if (
            !unlistenRef.current.taskId ||
            unlistenRef.current.taskId !== selectedTaskId
          ) {
            console.log('[loadResult] 需要设置新的监听器')
            await setupTaskListeners(selectedTaskId)
          } else {
            console.log('[loadResult] 监听器已存在，跳过设置')
          }
        } else {
          // 如果任务不是运行状态，确保清理监听器
          // 但只有当之前是运行状态时才清理，避免重复清理
          if (previousSelectedTaskStatusRef.current === TranscriptionTaskStatus.RUNNING) {
            console.log('[loadResult] 任务不是运行状态，清理监听器')
            cleanupTaskListeners()
          }
        }

        if (isCancelled) return

        if (selectedTaskStatus === TranscriptionTaskStatus.COMPLETED) {
          try {
            const content = await invoke<string>('read_transcription_result', {
              taskId: selectedTaskId,
            })
            if (!isCancelled) {
              setResultContent(content)
            }
          } catch (err) {
            console.error('读取结果失败:', err)
            if (!isCancelled) {
              setResultContent(null)
            }
          }
        } else if (!isCancelled) {
          setResultContent(null)
        }

        // 更新 ref
        previousSelectedTaskIdRef.current = selectedTaskId
        previousSelectedTaskStatusRef.current = selectedTaskStatus
      }
    }

    loadResult()

    return () => {
      isCancelled = true
      // 不在 cleanup 中自动清理，只在真正需要时清理
    }
  }, [selectedTaskId, selectedTaskStatus, setupTaskListeners, cleanupTaskListeners])

  useEffect(() => {
    return () => {
      if (unlistenRef.current.stdout) {
        unlistenRef.current.stdout()
      }
      if (unlistenRef.current.stderr) {
        unlistenRef.current.stderr()
      }
      unlistenRef.current.stdout = undefined
      unlistenRef.current.stderr = undefined
      unlistenRef.current.taskId = undefined
      isSettingUpRef.current = false
      settingUpTaskIdRef.current = null
    }
  }, [])

  return {
    resultContent,
    setResultContent,
    cleanupTaskListeners,
  }
}

export default useTranscriptionTaskRuntime
