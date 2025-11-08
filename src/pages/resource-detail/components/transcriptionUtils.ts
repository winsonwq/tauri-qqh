import { TranscriptionTaskStatus } from '../../../models';

// 获取状态显示文本
export const getStatusText = (status: string) => {
  switch (status) {
    case TranscriptionTaskStatus.PENDING:
      return '待转写';
    case TranscriptionTaskStatus.RUNNING:
      return '转写中';
    case TranscriptionTaskStatus.COMPLETED:
      return '已完成';
    case TranscriptionTaskStatus.FAILED:
      return '失败';
    default:
      return status;
  }
};

// 获取状态颜色类
export const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case TranscriptionTaskStatus.PENDING:
      return 'badge-warning';
    case TranscriptionTaskStatus.RUNNING:
      return 'badge-info';
    case TranscriptionTaskStatus.COMPLETED:
      return 'badge-success';
    case TranscriptionTaskStatus.FAILED:
      return 'badge-error';
    default:
      return 'badge-ghost';
  }
};

