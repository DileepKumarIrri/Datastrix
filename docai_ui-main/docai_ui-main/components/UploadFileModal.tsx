
import React, { useState } from 'react';
import { SpinnerIcon, FileIcon, TrashIcon } from './Icons';

interface UploadFileModalProps {
    onClose: () => void;
    onUpload: (data: { collection: string, files: File[] }) => void;
    existingCollections: string[];
    isLoading: boolean;
    error: string | null;
    progress?: number;
}

const UploadFileModal: React.FC<UploadFileModalProps> = ({ onClose, onUpload, existingCollections, isLoading, error, progress }) => {
    const [collection, setCollection] = useState('');
    const [newCollection, setNewCollection] = useState('');
    const [isCreatingNewCollection, setIsCreatingNewCollection] = useState(false);
    const [files, setFiles] = useState<File[]>([]);

    const handleCollectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (e.target.value === '__CREATE_NEW__') {
            setIsCreatingNewCollection(true);
            setCollection('');
        } else {
            setIsCreatingNewCollection(false);
            setCollection(e.target.value);
            setNewCollection('');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(Array.from(e.target.files));
        }
    };
    
    const handleRemoveFile = (indexToRemove: number) => {
        setFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalCollection = isCreatingNewCollection ? newCollection.trim() : collection;
        if (files.length > 0 && finalCollection.trim() && !isLoading) {
            onUpload({
                collection: finalCollection.trim(),
                files
            });
        }
    }
    
    const getButtonText = () => {
        if (isLoading) {
            if (files.length > 1 && progress && progress > 0) {
                return `Uploading... (${progress}%)`;
            }
            return 'Uploading...';
        }
        return `Upload (${files.length})`;
    };
    
    const fileListDisplay = files.length > 0 && (
      <div className="file-list-preview" style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem', marginTop: '1rem', backgroundColor: 'var(--background-secondary)' }}>
        <ul style={{ listStyle: 'none', padding: '0', margin: 0, fontSize: '0.9rem' }}>
          {files.map((f, index) => (
            <li key={`${f.name}-${f.lastModified}-${index}`} className="upload-preview-item">
                <div className="upload-file-details">
                    <FileIcon />
                    <span className="upload-preview-filename" title={f.name}>{f.name}</span>
                </div>
                <div className="upload-file-meta">
                    <span className="upload-file-size">({Math.round(f.size / 1024)} KB)</span>
                    <button
                        type="button"
                        className="delete-button"
                        onClick={() => handleRemoveFile(index)}
                        aria-label={`Remove file ${f.name}`}
                        disabled={isLoading}
                    >
                        <TrashIcon />
                    </button>
                </div>
            </li>
          ))}
        </ul>
      </div>
    );

    return (
        <div className="modal-overlay" onClick={isLoading ? undefined : onClose} role="dialog" aria-modal="true" aria-labelledby="upload-modal-title">
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <header className="modal-header">
                    <h2 id="upload-modal-title">Upload File(s)</h2>
                    <button className="close-button" onClick={onClose} aria-label="Close" disabled={isLoading}>&times;</button>
                </header>
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label htmlFor="collection-select">Collection</label>
                        <select id="collection-select" value={isCreatingNewCollection ? '__CREATE_NEW__' : collection} onChange={handleCollectionChange} required disabled={isLoading}>
                            <option value="" disabled>Select a collection</option>
                            {existingCollections.map(name => <option key={name} value={name}>{name}</option>)}
                            <option value="__CREATE_NEW__">
                                Create new collection...
                            </option>
                        </select>
                    </div>

                    {isCreatingNewCollection && (
                        <div className="input-group">
                            <label htmlFor="new-collection-name">New Collection Name</label>
                            <input
                                id="new-collection-name"
                                type="text"
                                value={newCollection}
                                onChange={(e) => setNewCollection(e.target.value)}
                                placeholder="e.g., Legal Contracts"
                                required
                                disabled={isLoading}
                            />
                        </div>
                    )}

                    <div className="input-group">
                        <label htmlFor="file-upload">File(s)</label>
                        {files.length === 0 ? (
                             <div className="file-drop-area">
                                <input type="file" id="file-upload" onChange={handleFileChange} required aria-label="File upload" disabled={isLoading} multiple />
                                <p>Drag & drop files here, or click to select</p>
                            </div>
                        ) : (
                            <div className="file-selection-container">
                                {fileListDisplay}
                                <div className="file-drop-area compact">
                                    <input type="file" id="file-upload" onChange={handleFileChange} aria-label="Add or change files" disabled={isLoading} multiple />
                                    <p>Drag more files or click to change selection</p>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {error && <p className="error-message" role="alert">{error}</p>}
                    
                    <div className="modal-actions">
                        <button type="button" className="button-secondary" onClick={onClose} disabled={isLoading}>Cancel</button>
                        <button type="submit" className="button-primary" disabled={files.length === 0 || (!collection && !newCollection.trim()) || isLoading}>
                            {isLoading && <SpinnerIcon />}
                            <span>{getButtonText()}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UploadFileModal;
