
import React, { useState } from 'react';
import { Collection, ToastType, FileData, CollectionFileUsage } from '../types';
import { ChevronDownIcon, FileIcon, UploadIcon, TrashIcon, SpinnerIcon, SearchIcon, SidebarExpandIcon, SidebarCollapseIcon, ViewIcon } from './Icons';
import UploadFileModal from './UploadFileModal';
import ConfirmationModal from './ConfirmationModal';
import { uploadFile, deleteFile, deleteCollection, getFileUsage, getCollectionUsage } from '../services/api';
import PdfViewerModal from './PdfViewerModal';

interface RightSideBarProps {
    collections: Collection[];
    onRefreshCollections: () => Promise<void>;
    showToast: (message: string, type: ToastType) => number;
    hideToast: (id: number) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

type DeletionTarget = { type: 'file'; id: string; name: string } | { type: 'collection'; name: string } | null;

const RightSideBar: React.FC<RightSideBarProps> = (props) => {
    const { collections, onRefreshCollections, showToast, hideToast, isCollapsed, onToggleCollapse } = props;
    
    const [openCollections, setOpenCollections] = useState<Set<string>>(new Set(collections.map(c => c.id)));
    const [searchTerm, setSearchTerm] = useState('');
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [deletionTarget, setDeletionTarget] = useState<DeletionTarget>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCheckingUsage, setIsCheckingUsage] = useState<string | null>(null); // Can be file ID or collection name
    const [usageInfo, setUsageInfo] = useState<(string[] | CollectionFileUsage[]) | null>(null);
    const [pdfViewerInfo, setPdfViewerInfo] = useState<{ url: string; title: string } | null>(null);

    const toggleCollection = (collectionId: string) => {
        setOpenCollections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(collectionId)) {
                newSet.delete(collectionId);
            } else {
                newSet.add(collectionId);
            }
            return newSet;
        });
    };

    const handleUpload = async (data: { collection: string; files: File[] }) => {
        setIsUploading(true);
        setUploadError(null);
        setUploadProgress(0);

        const totalFiles = data.files.length;
        const loadingToastId = showToast(`Uploading ${totalFiles} file(s)...`, 'loading');

        let successfulUploads = 0;
        const failedUploads: { fileName: string, message: string }[] = [];

        for (let i = 0; i < totalFiles; i++) {
            const file = data.files[i];
            const formData = new FormData();
            formData.append('file', file);
            formData.append('collection', data.collection);

            try {
                await uploadFile(formData);
                successfulUploads++;
            } catch (err: any) {
                failedUploads.push({ fileName: file.name, message: err.message || 'Unknown error' });
            }
            
            const progress = Math.round(((i + 1) / totalFiles) * 100);
            setUploadProgress(progress);
        }

        hideToast(loadingToastId);

        if (failedUploads.length > 0) {
            const errorDetails = failedUploads.map(f => `${f.fileName}: ${f.message}`).join('; ');
            showToast(`${successfulUploads} succeeded, ${failedUploads.length} failed.`, 'error');
            setUploadError(`${failedUploads.length} file(s) failed to upload. Errors: ${errorDetails.substring(0, 200)}...`);
        } else {
            showToast('All files uploaded successfully!', 'success');
            setIsUploadModalOpen(false);
        }

        if (successfulUploads > 0) {
            await onRefreshCollections();
        }
        
        setIsUploading(false);
    };

    const handleDeleteRequest = async (target: DeletionTarget) => {
        if (!target) return;
        setUsageInfo(null);

        if (target.type === 'collection') {
            setIsCheckingUsage(target.name);
            try {
                const usage = await getCollectionUsage(target.name);
                setUsageInfo(usage);
                setDeletionTarget(target);
            } catch (err: any) {
                console.error("Failed to check collection usage:", err);
                alert(`Could not check collection usage: ${err.message}. Deletion aborted.`);
            } finally {
                setIsCheckingUsage(null);
            }
        } else { // 'file'
            setIsCheckingUsage(target.id);
            try {
                const sessions = await getFileUsage(target.id);
                setUsageInfo(sessions);
                setDeletionTarget(target);
            } catch (err: any) {
                console.error("Failed to check file usage:", err);
                alert(`Could not check file usage: ${err.message}. Deletion aborted.`);
            } finally {
                setIsCheckingUsage(null);
            }
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletionTarget) return;

        setIsDeleting(true);
        try {
            if (deletionTarget.type === 'file') {
                await deleteFile(deletionTarget.id);
            } else {
                await deleteCollection(deletionTarget.name);
            }
            await onRefreshCollections();
            showToast(`Successfully deleted ${deletionTarget.type} "${deletionTarget.name}"`, 'success');
            setDeletionTarget(null);
        } catch (err: any) {
            console.error(`Failed to delete ${deletionTarget.type}:`, err);
            showToast(`Error deleting ${deletionTarget.type}: ${err.message}`, 'error');
        } finally {
            setIsDeleting(false);
        }
    };
    
    const filteredCollections = collections
        .map(collection => {
            const term = searchTerm.toLowerCase();
            const collectionNameMatches = collection.name.toLowerCase().includes(term);

            // If the collection name matches, show all of its files, not just matching ones.
            if (collectionNameMatches) {
                return collection;
            }

            // Otherwise, filter files within the collection.
            const filteredFiles = collection.files.filter(file =>
                file.name.toLowerCase().includes(term)
            );

            // Return a new collection object with only the filtered files.
            return { ...collection, files: filteredFiles };
        })
        // Finally, only keep collections that still have files to show.
        .filter(collection => collection.files.length > 0);


    return (
        <>
            <aside className={`right-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="sidebar-top">
                    <div className="right-sidebar-header">
                        <h3>File Manager</h3>
                        <button className="sidebar-action-button" onClick={onToggleCollapse} title={isCollapsed ? 'Expand' : 'Collapse'}>
                            {isCollapsed ? <SidebarCollapseIcon /> : <SidebarExpandIcon />}
                        </button>
                    </div>
                     <button className="sidebar-button upload-button" onClick={() => setIsUploadModalOpen(true)} title="Upload a file">
                        <UploadIcon />
                        <span>Upload</span>
                    </button>
                </div>
                <div className="sidebar-search-container">
                    <div className="search-bar">
                        <SearchIcon />
                        <input 
                            type="text" 
                            placeholder="Search files..." 
                            aria-label="Search all files"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <div className="files-list">
                    {filteredCollections.map(collection => (
                        <CollectionGroup 
                            key={collection.id}
                            collection={collection}
                            isExpanded={openCollections.has(collection.id)}
                            toggleCollection={toggleCollection}
                            handleDeleteRequest={handleDeleteRequest}
                            isCheckingUsage={isCheckingUsage}
                            onViewFile={(file) => setPdfViewerInfo({ url: file.viewUrl!, title: file.name })}
                        />
                    ))}
                </div>
            </aside>
            {isUploadModalOpen && <UploadFileModal 
                onClose={() => {
                    setIsUploadModalOpen(false);
                    setUploadProgress(0);
                }} 
                onUpload={handleUpload} 
                existingCollections={collections.map(c => c.name)}
                isLoading={isUploading}
                error={uploadError}
                progress={uploadProgress}
            />}
            <ConfirmationModal
                isOpen={!!deletionTarget}
                onClose={() => setDeletionTarget(null)}
                onConfirm={handleConfirmDelete}
                title={`Delete ${deletionTarget?.type}`}
                message={deletionTarget?.type === 'file' 
                    ? `Are you sure you want to permanently delete the file "${deletionTarget.name}"?`
                    : `Are you sure you want to permanently delete the collection "${deletionTarget?.name}" and all of its files? This action cannot be undone.`
                }
                isLoading={isDeleting}
                usageInfo={usageInfo}
                confirmationText={deletionTarget?.type === 'file'
                    ? "I understand that deleting this file may affect the context of past chat sessions."
                    : "I understand this action is permanent and may affect existing chat sessions."
                }
            />
            {pdfViewerInfo && (
                <PdfViewerModal
                    isOpen={!!pdfViewerInfo}
                    onClose={() => setPdfViewerInfo(null)}
                    pdfUrl={pdfViewerInfo.url}
                    title={pdfViewerInfo.title}
                />
            )}
        </>
    );
};

interface CollectionGroupProps {
    collection: Collection;
    isExpanded: boolean;
    toggleCollection: (id: string) => void;
    handleDeleteRequest: (target: DeletionTarget) => void;
    isCheckingUsage: string | null;
    onViewFile: (file: FileData) => void;
}

const CollectionGroup: React.FC<CollectionGroupProps> = ({ collection, isExpanded, toggleCollection, handleDeleteRequest, isCheckingUsage, onViewFile }) => (
    <div className="collection-group">
        <div className="collection-header item-row" onClick={() => toggleCollection(collection.id)} role="button" tabIndex={0} onKeyDown={e=> e.key === 'Enter' && toggleCollection(collection.id)}>
            <span className="collection-name">{collection.name}</span>
            <div className={`chevron-icon ${isExpanded ? 'expanded' : ''}`}>
                <ChevronDownIcon />
            </div>
            <button
                className="delete-button"
                onClick={(e) => { e.stopPropagation(); handleDeleteRequest({ type: 'collection', name: collection.name }); }}
                aria-label={`Delete collection ${collection.name}`}
                disabled={isCheckingUsage === collection.name}
            >
                {isCheckingUsage === collection.name ? <SpinnerIcon /> : <TrashIcon />}
            </button>
        </div>
        {isExpanded && (
            <ul className="file-items">
                {collection.files.map(file => (
                    <FileItem 
                        key={file.id} 
                        file={file} 
                        handleDeleteRequest={handleDeleteRequest} 
                        isCheckingUsage={isCheckingUsage}
                        onViewFile={onViewFile}
                    />
                ))}
            </ul>
        )}
    </div>
);

interface FileItemProps {
    file: FileData;
    handleDeleteRequest: (target: DeletionTarget) => void;
    isCheckingUsage: string | null;
    onViewFile: (file: FileData) => void;
}

const FileItem: React.FC<FileItemProps> = ({ file, handleDeleteRequest, isCheckingUsage, onViewFile }) => (
     <li className="item-row">
        <div className="file-info">
            <FileIcon />
            <span title={file.name}>{file.name}</span>
        </div>
        <div className="file-actions">
            <button
                className="view-button"
                onClick={() => onViewFile(file)}
                aria-label={`View file ${file.name}`}
            >
                <ViewIcon />
            </button>
            <button
                className="delete-button"
                onClick={() => handleDeleteRequest({ type: 'file', id: file.id, name: file.name })}
                aria-label={`Delete file ${file.name}`}
                disabled={isCheckingUsage === file.id}
            >
                {isCheckingUsage === file.id ? <SpinnerIcon /> : <TrashIcon />}
            </button>
        </div>
    </li>
)

export default RightSideBar;
