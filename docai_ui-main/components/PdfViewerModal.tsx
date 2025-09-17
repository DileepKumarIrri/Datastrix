
import React from 'react';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  title: string;
}

const PdfViewerModal: React.FC<PdfViewerModalProps> = ({ isOpen, onClose, pdfUrl, title }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="pdf-viewer-title">
      <div className="modal-content" style={{ width: '90vw', height: '90vh', maxWidth: '1200px', padding: '1rem', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <header className="modal-header" style={{ flexShrink: 0, paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
          <h2 id="pdf-viewer-title">{title}</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">&times;</button>
        </header>
        <div className="modal-body" style={{ flexGrow: 1, padding: 0, border: '1px solid var(--border-color)' }}>
          <iframe
            src={pdfUrl}
            title={`PDF Viewer: ${title}`}
            width="100%"
            height="100%"
            style={{ border: 'none' }}
          />
        </div>
      </div>
    </div>
  );
};

export default PdfViewerModal;
