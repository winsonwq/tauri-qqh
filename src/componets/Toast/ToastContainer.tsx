import { useEffect, useState } from 'react';
import { useToast } from './useToast';
import { 
  HiCheckCircle, 
  HiXCircle, 
  HiExclamationTriangle, 
  HiInformationCircle,
  HiXMark 
} from 'react-icons/hi2';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  content: string;
  duration?: number;
}

const ToastContainer = () => {
  const { messages, removeMessage } = useToast();
  const [visibleMessages, setVisibleMessages] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 当新消息添加时，设置为可见
    messages.forEach((msg) => {
      if (!visibleMessages.has(msg.id)) {
        setVisibleMessages((prev) => new Set(prev).add(msg.id));
      }
    });
  }, [messages, visibleMessages]);

  const getToastClass = (type: ToastType) => {
    const baseClass = 'alert shadow-lg mb-2 transition-all duration-300';
    switch (type) {
      case 'success':
        return `${baseClass} alert-success`;
      case 'error':
        return `${baseClass} alert-error`;
      case 'warning':
        return `${baseClass} alert-warning`;
      case 'info':
        return `${baseClass} alert-info`;
      default:
        return `${baseClass} alert-info`;
    }
  };

  const getIcon = (type: ToastType) => {
    const iconClass = "shrink-0 h-6 w-6";
    switch (type) {
      case 'success':
        return <HiCheckCircle className={iconClass} />;
      case 'error':
        return <HiXCircle className={iconClass} />;
      case 'warning':
        return <HiExclamationTriangle className={iconClass} />;
      case 'info':
        return <HiInformationCircle className={iconClass} />;
    }
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {messages.map((message) => {
        if (!visibleMessages.has(message.id)) return null;
        
        return (
          <div
            key={message.id}
            role="alert"
            className={`${getToastClass(message.type)} pointer-events-auto max-w-md w-full`}
            style={{
              animation: 'slideInDown 0.3s ease-out',
            }}
          >
            {getIcon(message.type)}
            <span>{message.content}</span>
            <button
              className="btn btn-sm btn-circle btn-ghost shrink-0"
              onClick={() => {
                setVisibleMessages((prev) => {
                  const next = new Set(prev);
                  next.delete(message.id);
                  return next;
                });
                setTimeout(() => removeMessage(message.id), 300);
              }}
            >
              <HiXMark className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes slideInDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default ToastContainer;

