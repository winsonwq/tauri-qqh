import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastMessage, ToastType } from './ToastContainer';

interface ToastContextType {
  messages: ToastMessage[];
  addMessage: (type: ToastType, content: string, duration?: number) => string;
  removeMessage: (id: string) => void;
  success: (content: string, duration?: number) => string;
  error: (content: string, duration?: number) => string;
  warning: (content: string, duration?: number) => string;
  info: (content: string, duration?: number) => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const addMessage = useCallback((type: ToastType, content: string, duration = 3000): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newMessage: ToastMessage = {
      id,
      type,
      content,
      duration,
    };

    setMessages((prev) => [...prev, newMessage]);

    // 自动移除
    if (duration > 0) {
      setTimeout(() => {
        setMessages((prev) => prev.filter((msg) => msg.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  const success = useCallback((content: string, duration?: number) => {
    return addMessage('success', content, duration);
  }, [addMessage]);

  const error = useCallback((content: string, duration?: number) => {
    return addMessage('error', content, duration);
  }, [addMessage]);

  const warning = useCallback((content: string, duration?: number) => {
    return addMessage('warning', content, duration);
  }, [addMessage]);

  const info = useCallback((content: string, duration?: number) => {
    return addMessage('info', content, duration);
  }, [addMessage]);

  return (
    <ToastContext.Provider
      value={{
        messages,
        addMessage,
        removeMessage,
        success,
        error,
        warning,
        info,
      }}
    >
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

