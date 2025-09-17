
import React, { useEffect } from 'react';
import { ToastState, ToastType } from '../types';
import { SpinnerIcon, CheckCircleIcon, ErrorIcon } from './Icons';

interface ToastProps {
  toast: ToastState;
  onDismiss: (id: number) => void;
}

const ToastIcons: Record<ToastType, React.ReactElement> = {
  success: <CheckCircleIcon />,
  error: <ErrorIcon />,
  loading: <SpinnerIcon />,
};

const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const { id, message, type } = toast;

  useEffect(() => {
    if (type !== 'loading') {
      const timer = setTimeout(() => {
        onDismiss(id);
      }, 5000); // Auto-dismiss after 5 seconds

      return () => clearTimeout(timer);
    }
  }, [id, type, onDismiss]);

  return (
    <div className={`toast ${type}`} role="alert">
      <div className="toast-icon">{ToastIcons[type]}</div>
      <div className="toast-message">{message}</div>
      <button className="toast-close" onClick={() => onDismiss(id)} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
};

export default Toast;
