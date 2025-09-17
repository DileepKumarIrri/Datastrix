
import React, { useState, useEffect } from 'react';
import { CollectionFileUsage } from '../types';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  isLoading: boolean;
  usageInfo?: (string[] | CollectionFileUsage[]) | null;
  confirmationText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, message, isLoading, usageInfo, confirmationText }) => {
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsConfirmed(false); // Reset checkbox on modal open
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }
  
  const isCollectionUsage = (info: any): info is CollectionFileUsage[] => {
    return Array.isArray(info) && info.length > 0 && typeof info[0] === 'object' && 'fileName' in info[0] && 'sessions' in info[0];
  }

  const needsAcknowledgement = usageInfo && usageInfo.length > 0;
  const isConfirmDisabled = isLoading || (needsAcknowledgement && !isConfirmed);

  return (
    <div className="modal-overlay" onClick={isLoading ? undefined : onClose} role="dialog" aria-modal="true" aria-labelledby="confirmation-modal-title">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="confirmation-modal-title">{title}</h2>
          <button className="close-button" onClick={onClose} aria-label="Close" disabled={isLoading}>&times;</button>
        </header>
        <div className="modal-body">
          <p>{message}</p>
          {needsAcknowledgement && (
             <div className="confirmation-usage-warning">
              {isCollectionUsage(usageInfo) ? (
                  <>
                      <h4>This collection contains files used in the following sessions:</h4>
                      <ul>
                          {(usageInfo as CollectionFileUsage[]).map(item => (
                              <li key={item.fileName}>
                                  <strong>{item.fileName}</strong> is used in:
                                  <ul>
                                      {item.sessions.map(session => <li key={session}>{session}</li>)}
                                  </ul>
                              </li>
                          ))}
                      </ul>
                  </>
              ) : (
                  <>
                      <h4>This file is used in the following {usageInfo.length} chat session(s):</h4>
                      <ul>
                          {(usageInfo as string[]).map(sessionName => <li key={sessionName}>{sessionName}</li>)}
                      </ul>
                  </>
              )}
            </div>
          )}
        </div>
        {needsAcknowledgement && (
          <div className="confirmation-checkbox-group">
            <input
              type="checkbox"
              id="understand-checkbox"
              checked={isConfirmed}
              onChange={() => setIsConfirmed(!isConfirmed)}
              disabled={isLoading}
            />
            <label htmlFor="understand-checkbox">
              {confirmationText || 'I understand this may impact existing chats.'}
            </label>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            style={{ backgroundColor: 'var(--danger-color)' }}
          >
            {isLoading ? 'Deleting...' : 'Confirm Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
