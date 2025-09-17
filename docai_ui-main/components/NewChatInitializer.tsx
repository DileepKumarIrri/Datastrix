
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Collection, FileData, ChatSession, Message } from '../types';
import { createChatSession, postChatMessage, generateChatTitle, updateChatSession } from '../services/api';
import { SearchIcon, FileIcon, SpinnerIcon, SendIcon, TrashIcon, ChevronDownIcon } from './Icons';
import GeneratingStatusIndicator from './GeneratingStatusIndicator';

interface NewChatInitializerProps {
    setActiveChat: React.Dispatch<React.SetStateAction<ChatSession | null>>;
    setChatSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    setSessionFiles: React.Dispatch<React.SetStateAction<FileData[]>>;
    collections: Collection[];
}

const NewChatInitializer: React.FC<NewChatInitializerProps> = ({ setActiveChat, setChatSessions, setMessages, setSessionFiles, collections }) => {
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
    const [filesToSelect, setFilesToSelect] = useState<Set<string>>(new Set());
    const [prompt, setPrompt] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openCollections, setOpenCollections] = useState<Set<string>>(new Set());
    const [submittedMessage, setSubmittedMessage] = useState<Message | null>(null);

    useEffect(() => {
        if (collections.length > 0) {
            // When the component loads or the list of collections changes,
            // default all collection accordions to be open.
            setOpenCollections(new Set(collections.map(c => c.id)));
        }
    }, [collections]);

    const handleRemoveFileSelection = (fileId: string) => {
        setSelectedFileIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(fileId);
            return newSet;
        });
    };
    
    const handleRemoveCollectionSelection = (filesInCollection: FileData[]) => {
        const fileIdsToRemove = new Set(filesInCollection.map(f => f.id));
        setSelectedFileIds(prev => {
            const newSet = new Set(prev);
            fileIdsToRemove.forEach(id => newSet.delete(id));
            return newSet;
        });
    };

    const toggleFileToSelect = (fileId: string) => {
        setFilesToSelect(prev => {
            const newSet = new Set(prev);
            if (newSet.has(fileId)) {
                newSet.delete(fileId);
            } else {
                newSet.add(fileId);
            }
            return newSet;
        });
    };
    
    const handleToggleCollectionToSelect = (collectionFiles: FileData[]) => {
        const fileIdsInCollection = collectionFiles.map(f => f.id);
        const areAllSelected = fileIdsInCollection.every(id => filesToSelect.has(id));

        setFilesToSelect(prev => {
            const newSet = new Set(prev);
            if (areAllSelected) {
                fileIdsInCollection.forEach(id => newSet.delete(id));
            } else {
                fileIdsInCollection.forEach(id => newSet.add(id));
            }
            return newSet;
        });
    };

    const handleAddSelectedFiles = () => {
        setSelectedFileIds(prev => new Set([...prev, ...filesToSelect]));
        setFilesToSelect(new Set());
    };


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


    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim() || selectedFileIds.size === 0 || isSubmitting) return;

        setIsSubmitting(true);
        setError(null);

        const userMessage: Message = {
            id: `user-temp-${Date.now()}`,
            text: prompt.trim(),
            sender: 'user',
            timestamp: new Date().toISOString(),
        };

        setSubmittedMessage(userMessage);

        try {
            const tempChatName = prompt.substring(0, 40) + (prompt.length > 40 ? '...' : '');
            const newSession = await createChatSession(tempChatName);
            
            const allFilesFlat = collections.flatMap(c => c.files);
            const selectedFileObjects = allFilesFlat.filter(f => selectedFileIds.has(f.id));
            
            const aiMessage = await postChatMessage(newSession.id, prompt.trim(), Array.from(selectedFileIds));
            
            const updatedText = aiMessage.text.substring(0, 100) + (aiMessage.text.length > 100 ? '...' : '');
            
            const titlePromise = generateChatTitle(prompt)
                .then(titleResponse => updateChatSession(newSession.id, titleResponse.title.replace(/["']/g, "")))
                .catch(err => {
                    console.error("Background title generation/update failed:", err);
                    return newSession; 
                });

            const updatedSession = await titlePromise;

            setSessionFiles(selectedFileObjects);
            setMessages([userMessage, aiMessage]);
            const finalSessionState = { ...updatedSession, lastMessage: updatedText };
            setChatSessions(prev => [finalSessionState, ...prev.filter(s => s.id !== newSession.id)]);
            setActiveChat(finalSessionState);

        } catch (err: any) {
            setError(`Failed to start chat: ${err.message}`);
            setIsSubmitting(false);
            setSubmittedMessage(null);
        }
    };
    
    if (submittedMessage) {
        return (
            <div className="chat-view">
                <div className="messages-list">
                     <div className="message-bubble user">
                        <div className="message-content">
                            <div className="markdown-content">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{submittedMessage.text}</ReactMarkdown>
                            </div>
                        </div>
                        <span className="message-timestamp">{new Date(submittedMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                     <div className="message-bubble ai">
                        <div className="message-content">
                           <GeneratingStatusIndicator />
                        </div>
                    </div>
                </div>
                <div className="message-input-form">
                    <div className="input-wrapper">
                        <textarea placeholder="Generating response..." rows={1} disabled />
                        <button type="button" disabled>
                            <SpinnerIcon />
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    
    // Group selected files by collection for organized display
    const fileToCollectionNameMap = new Map<string, string>();
    collections.forEach(c => c.files.forEach(f => fileToCollectionNameMap.set(f.id, c.name)));
    const selectedFiles = collections.flatMap(c => c.files).filter(file => selectedFileIds.has(file.id));
    const groupedSelectedFiles = selectedFiles.reduce((acc, file) => {
        const collectionName = fileToCollectionNameMap.get(file.id) || 'Uncategorized';
        if (!acc[collectionName]) acc[collectionName] = [];
        acc[collectionName].push(file);
        return acc;
    }, {} as Record<string, FileData[]>);
    const orderedGroupedFiles = Object.keys(groupedSelectedFiles).sort().map(collectionName => ({
        collectionName,
        files: groupedSelectedFiles[collectionName]
    }));

    // Filter available files for the library view
    const availableCollections = collections
        .map(collection => {
            const unselectedFiles = collection.files.filter(file => !selectedFileIds.has(file.id));
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


    return (
        <div className="new-chat-initializer">
            <div className="new-chat-main-area">
                <div className="new-chat-welcome">
                    <h1>Start a New Chat</h1>
                    <p>Select one or more files from your library to provide context for your conversation. Then, type your first message below.</p>
                </div>
                <div className="new-chat-content">
                    <div className="new-chat-files-pane">
                        <h3>Selected Files ({selectedFiles.length})</h3>
                        <div className={`new-chat-file-list ${orderedGroupedFiles.length > 0 ? 'scrollable' : ''}`}>
                            {orderedGroupedFiles.length === 0 ? (
                                <div className="empty-list-placeholder">Add files from the right to start a chat.</div>
                            ) : (
                                <ul className="grouped-file-list">
                                    {orderedGroupedFiles.map(({ collectionName, files }) => (
                                        <li key={collectionName}>
                                            <div className="grouped-file-list-header">
                                                <span className="collection-name">{collectionName} ({files.length})</span>
                                                <button
                                                    className="delete-button"
                                                    onClick={() => handleRemoveCollectionSelection(files)}
                                                    aria-label={`Remove all files from ${collectionName}`}
                                                >
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                            <ul>
                                                {files.map(file => (
                                                    <li key={file.id} className="new-chat-file-item">
                                                        <div className="file-info">
                                                            <FileIcon />
                                                            <span title={file.name}>{file.name}</span>
                                                        </div>
                                                        <button className="add-remove-button" onClick={() => handleRemoveFileSelection(file.id)} aria-label={`Remove ${file.name}`}>
                                                            <TrashIcon />
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                    <div className="new-chat-files-pane">
                        <h3>Available Files</h3>
                        <div className="search-bar" style={{ margin: '0 0 1rem 0' }}>
                            <SearchIcon />
                            <input
                                type="text"
                                placeholder="Search your files..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className={`new-chat-file-list ${availableCollections.length > 0 ? 'scrollable' : ''}`}>
                            {availableCollections.length === 0 && <div className="empty-list-placeholder">{searchTerm ? "No files match your search." : (collections.length === 0 ? "You haven't uploaded any files." : "All files are selected.")}</div>}
                            <ul className="modal-file-list" style={{listStyle: 'none', padding: 0, margin: 0}}>
                                {availableCollections.map(collection => {
                                    const availableFilesInCollection = collection.files;
                                    const selectedCount = availableFilesInCollection.filter(f => filesToSelect.has(f.id)).length;
                                    const isChecked = selectedCount === availableFilesInCollection.length && availableFilesInCollection.length > 0;
                                    const isIndeterminate = selectedCount > 0 && selectedCount < availableFilesInCollection.length;
                                    
                                    return (
                                    <React.Fragment key={collection.id}>
                                        <li className="collection-group-header">
                                            <label className="collection-select-label" style={{ padding: '0.5rem 0' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    ref={el => { if (el) el.indeterminate = isIndeterminate; }}
                                                    onChange={() => handleToggleCollectionToSelect(availableFilesInCollection)}
                                                />
                                                <span onClick={(e) => { e.preventDefault(); toggleCollection(collection.id); }}>{collection.name}</span>
                                            </label>
                                            <div className={`chevron-icon ${openCollections.has(collection.id) ? 'expanded' : ''}`} onClick={() => toggleCollection(collection.id)} style={{cursor: 'pointer', padding: '0.5rem'}}>
                                                <ChevronDownIcon />
                                            </div>
                                        </li>
                                        {openCollections.has(collection.id) && availableFilesInCollection.map(file => (
                                            <li key={file.id} style={{paddingLeft: '2rem'}}>
                                                <label htmlFor={`select-file-${file.id}`} className="file-info" style={{display:'flex', gap: '0.75rem', alignItems: 'center', width: '100%', cursor: 'pointer', padding: '0.5rem 0'}}>
                                                    <input
                                                        type="checkbox"
                                                        id={`select-file-${file.id}`}
                                                        checked={filesToSelect.has(file.id)}
                                                        onChange={() => toggleFileToSelect(file.id)}
                                                    />
                                                    <FileIcon />
                                                    <span>{file.name}</span>
                                                </label>
                                            </li>
                                        ))}
                                    </React.Fragment>
                                    );
                                })}
                            </ul>
                        </div>
                        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                            <button
                                type="button"
                                className="button-primary"
                                style={{ width: '100%' }}
                                onClick={handleAddSelectedFiles}
                                disabled={filesToSelect.size === 0 || isSubmitting}
                            >
                                Add Selected Files ({filesToSelect.size})
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <form className="message-input-form" onSubmit={handleSubmit}>
                 {error && <p className="chat-error-message">{error}</p>}
                <div className="input-wrapper">
                    <textarea 
                        value={prompt}
                        onChange={handleInputChange}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }}}
                        placeholder="Type your message, or ask about your files..."
                        rows={1}
                        aria-label="Chat message input"
                        disabled={isSubmitting}
                    />
                    <button type="submit" aria-label="Start Chat" disabled={!prompt.trim() || selectedFileIds.size === 0 || isSubmitting}>
                         {isSubmitting ? <SpinnerIcon /> : <SendIcon />}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default NewChatInitializer;
