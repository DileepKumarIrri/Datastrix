import React, { useState, useEffect } from 'react';
import { Collection, FileData, ToastType } from '../types';
import { FileIcon, TrashIcon, SearchIcon, PlusIcon, SpinnerIcon, ChevronDownIcon } from './Icons';
import { getFilesAndCollections, addFilesToSession, removeFileFromSession } from '../services/api';

interface ManageSessionFilesModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionFiles: FileData[];
    chatId: string;
    onSessionFilesChange: () => void;
    showToast: (message: string, type: ToastType) => number;
}

const ManageSessionFilesModal: React.FC<ManageSessionFilesModalProps> = (props) => {
    const { isOpen, onClose, sessionFiles, chatId, onSessionFilesChange, showToast } = props;

    const [allUserCollections, setAllUserCollections] = useState<Collection[]>([]);
    const [openCollections, setOpenCollections] = useState<Set<string>>(new Set());
    const [filesToAdd, setFilesToAdd] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const [collectionBeingRemoved, setCollectionBeingRemoved] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            const fetchAllFiles = async () => {
                setIsLoading(true);
                try {
                    const collections = await getFilesAndCollections();
                    setAllUserCollections(collections);
                    setOpenCollections(new Set(collections.map(c => c.id)));
                } catch (err) {
                    showToast('Could not load your file library.', 'error');
                } finally {
                    setIsLoading(false);
                }
            };
            fetchAllFiles();
        }
    }, [isOpen, showToast]);

    if (!isOpen) return null;

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

    const sessionFileIds = new Set(sessionFiles.map(f => f.id));
    
    // Filter available files for the library view
    const availableCollections = allUserCollections
        .map(collection => {
            const unselectedFiles = collection.files.filter(file => !sessionFileIds.has(file.id));
            const term = searchTerm.toLowerCase();
            const filteredFiles = searchTerm
                ? unselectedFiles.filter(file => 
                    file.name.toLowerCase().includes(term) || 
                    collection.name.toLowerCase().includes(term)
                  )
                : unselectedFiles;
            return { ...collection, files: filteredFiles };
        })
        .filter(collection => collection.files.length > 0);


    const handleRemoveFile = async (fileId: string) => {
        setIsUpdating(true);
        try {
            await removeFileFromSession(chatId, fileId);
            showToast('File removed from session.', 'success');
            onSessionFilesChange();
        } catch (err: any) {
            showToast(`Error removing file: ${err.message}`, 'error');
        } finally {
            setIsUpdating(false);
        }
    };
    
    const handleRemoveCollectionFromSession = async (collectionName: string, filesInCollection: FileData[]) => {
        setIsUpdating(true);
        setCollectionBeingRemoved(collectionName);
        try {
            await Promise.all(filesInCollection.map(file => removeFileFromSession(chatId, file.id)));
            showToast('Collection removed from session.', 'success');
            onSessionFilesChange();
        } catch (err: any) {
            showToast(`Error removing collection: ${err.message}`, 'error');
        } finally {
            setIsUpdating(false);
            setCollectionBeingRemoved(null);
        }
    };


    const handleAddFiles = async () => {
        if (filesToAdd.size === 0) return;
        setIsUpdating(true);
        try {
            await addFilesToSession(chatId, Array.from(filesToAdd));
            showToast(`${filesToAdd.size} file(s) added to session.`, 'success');
            setFilesToAdd(new Set());
            onSessionFilesChange();
        } catch (err: any) {
            showToast(`Error adding files: ${err.message}`, 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    const toggleFileToAdd = (fileId: string) => {
        setFilesToAdd(prev => {
            const newSet = new Set(prev);
            if (newSet.has(fileId)) {
                newSet.delete(fileId);
            } else {
                newSet.add(fileId);
            }
            return newSet;
        });
    };

    const handleToggleCollectionSelection = (collectionFiles: FileData[]) => {
        const fileIdsInCollection = collectionFiles.map(f => f.id);
        const areAllSelected = fileIdsInCollection.every(id => filesToAdd.has(id));

        setFilesToAdd(prev => {
            const newSet = new Set(prev);
            if (areAllSelected) {
                fileIdsInCollection.forEach(id => newSet.delete(id));
            } else {
                fileIdsInCollection.forEach(id => newSet.add(id));
            }
            return newSet;
        });
    };
    
    const fileToCollectionNameMap = new Map<string, string>();
    allUserCollections.forEach(c => c.files.forEach(f => fileToCollectionNameMap.set(f.id, c.name)));
    const groupedSessionFiles = sessionFiles.reduce((acc, file) => {
        const collectionName = fileToCollectionNameMap.get(file.id) || 'Uncategorized';
        if (!acc[collectionName]) acc[collectionName] = [];
        acc[collectionName].push(file);
        return acc;
    }, {} as Record<string, FileData[]>);
    const orderedGroupedSessionFiles = Object.keys(groupedSessionFiles).sort().map(collectionName => ({
        collectionName,
        files: groupedSessionFiles[collectionName]
    }));

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content manage-files-modal" onClick={(e) => e.stopPropagation()}>
                <header className="modal-header">
                    <h2>Manage Session Files</h2>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </header>
                <div className="modal-body">
                    {/* Files currently in session */}
                    <div>
                        <h3>Files in Session ({sessionFiles.length})</h3>
                        <div className="modal-list-wrapper">
                            <ul className="grouped-file-list">
                                {orderedGroupedSessionFiles.length > 0 ? orderedGroupedSessionFiles.map(({ collectionName, files }) => (
                                    <li key={collectionName}>
                                        <div className="grouped-file-list-header">
                                            <span className="collection-name">{collectionName} ({files.length})</span>
                                            <button
                                                className="delete-button"
                                                onClick={() => handleRemoveCollectionFromSession(collectionName, files)}
                                                aria-label={`Remove all files from ${collectionName}`}
                                                disabled={isUpdating}
                                            >
                                                {collectionBeingRemoved === collectionName ? <SpinnerIcon /> : <TrashIcon />}
                                            </button>
                                        </div>
                                        <ul>
                                            {files.map(file => (
                                                <li key={file.id}>
                                                    <div className="file-info"><FileIcon /><span>{file.name}</span></div>
                                                    <button onClick={() => handleRemoveFile(file.id)} className="delete-button" disabled={isUpdating}>
                                                        <TrashIcon />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                )) : <li style={{padding: '1rem', fontStyle: 'italic', color: 'var(--text-secondary)'}}>No files in this session.</li>}
                            </ul>
                        </div>
                    </div>
                    {/* Add new files */}
                    <div>
                        <h3>Add Files from Library</h3>
                        <div className="search-bar" style={{margin: '0 0 1rem 0'}}>
                            <SearchIcon />
                            <input
                                type="text"
                                placeholder="Search all files..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="modal-list-wrapper">
                            {isLoading ? <p style={{ padding: '1rem', textAlign: 'center' }}>Loading files...</p> : (
                                <ul className="modal-file-list">
                                    {availableCollections.length > 0 ? availableCollections.map(collection => {
                                        const fileIdsInCollection = collection.files.map(f => f.id);
                                        const selectedCount = fileIdsInCollection.filter(id => filesToAdd.has(id)).length;
                                        const isChecked = selectedCount === fileIdsInCollection.length && fileIdsInCollection.length > 0;
                                        const isIndeterminate = selectedCount > 0 && selectedCount < fileIdsInCollection.length;
                                        
                                        return (
                                        <React.Fragment key={collection.id}>
                                            <li className="collection-group-header">
                                                <label className="collection-select-label" style={{ padding: '0.5rem 0' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        ref={el => { if (el) el.indeterminate = isIndeterminate; }}
                                                        onChange={() => handleToggleCollectionSelection(collection.files)}
                                                    />
                                                    <span onClick={(e) => { e.preventDefault(); toggleCollection(collection.id); }}>{collection.name}</span>
                                                </label>
                                                <div className={`chevron-icon ${openCollections.has(collection.id) ? 'expanded' : ''}`} onClick={() => toggleCollection(collection.id)} style={{cursor: 'pointer', padding: '0.5rem'}}>
                                                    <ChevronDownIcon />
                                                </div>
                                            </li>
                                            {openCollections.has(collection.id) && collection.files.map(file => (
                                                <li key={file.id} style={{paddingLeft: '2rem'}}>
                                                    <label htmlFor={`add-file-${file.id}`}>
                                                        <input
                                                            type="checkbox"
                                                            id={`add-file-${file.id}`}
                                                            checked={filesToAdd.has(file.id)}
                                                            onChange={() => toggleFileToAdd(file.id)}
                                                        />
                                                        <FileIcon />
                                                        <span>{file.name}</span>
                                                    </label>
                                                </li>
                                            ))}
                                        </React.Fragment>
                                        );
                                    }) : <li>No other files available to add.</li>}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
                <div className="modal-actions">
                    <button type="button" className="button-secondary" onClick={onClose} disabled={isUpdating}>Close</button>
                    <button type="button" className="button-primary" onClick={handleAddFiles} disabled={isUpdating || filesToAdd.size === 0}>
                        {isUpdating ? <SpinnerIcon/> : <PlusIcon />} Add Selected Files
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManageSessionFilesModal;