import { useToast } from './useToast';

/**
 * Toast 消息提示 Hook
 * 在组件中使用：
 * 
 * import { useMessage } from '@/componets/Toast';
 * 
 * const message = useMessage();
 * message.success('操作成功');
 * message.error('操作失败');
 */
export const useMessage = () => {
  const toast = useToast();
  
  return {
    success: (content: string, duration?: number) => toast.success(content, duration),
    error: (content: string, duration?: number) => toast.error(content, duration),
    warning: (content: string, duration?: number) => toast.warning(content, duration),
    info: (content: string, duration?: number) => toast.info(content, duration),
  };
};

/**
 * 全局 message API（需要在组件中使用 useMessage 获取）
 * 推荐使用 useMessage hook 的方式
 */
export { useMessage as message };

