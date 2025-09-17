
import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatSession, Message, FileData, ToastType, Collection } from '../types';
import { SendIcon, FileIcon, PlusIcon, SpinnerIcon } from './Icons';
import { postChatMessage } from '../services/api';
import NewChatInitializer from './NewChatInitializer';
import ManageSessionFilesModal from './ManageSessionFilesModal';
import GeneratingStatusIndicator from './GeneratingStatusIndicator';

interface ChatViewProps {
    activeChat: ChatSession | null;
    messages: Message[];
    sessionFiles: FileData[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    setActiveChat: React.Dispatch<React.SetStateAction<ChatSession | null>>;
    setChatSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
    setSessionFiles: React.Dispatch<React.SetStateAction<FileData[]>>;
    refreshSessionFiles: (sessionId: string) => Promise<void>;
    showToast: (message: string, type: ToastType) => number;
    collections: Collection[];
}

const ChatView: React.FC<ChatViewProps> = (props) => {
    const { 
        activeChat, messages, sessionFiles, setMessages, 
        setActiveChat, setChatSessions, setSessionFiles, refreshSessionFiles,
        showToast, collections
    } = props;
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);

    const [activeContextFileIds, setActiveContextFileIds] = useState<Set<string>>(new Set());
    const [isManageFilesModalOpen, setManageFilesModalOpen] = useState(false);
    
    // Ref to track the current chat ID to prevent context resets during a conversation
    const contextChatIdRef = useRef<string | null>(null);

    useEffect(() => {
        // This effect resets the active files context.
        // It should ONLY run when the user switches to a new chat, not when files
        // are refreshed mid-conversation.
        if (activeChat?.id !== contextChatIdRef.current) {
            setActiveContextFileIds(new Set(sessionFiles.map(f => f.id)));
            contextChatIdRef.current = activeChat?.id ?? null;
        }
    }, [sessionFiles, activeChat]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(() => {
        scrollToBottom();
    }, [messages]);
    
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() === '' || isSending || !activeChat) return;

        const allFileIdsForPrompt = Array.from(activeContextFileIds);

        if (allFileIdsForPrompt.length === 0) {
            setChatError("Please select at least one file in the Active Context bar to use for your prompt.");
            return;
        }
        setChatError(null);

        // Capture the names of the files being used for this specific prompt for consistent display on error.
        const filesUsedForPrompt = sessionFiles
            .filter(file => allFileIdsForPrompt.includes(file.id))
            .map(file => file.name);

        setIsSending(true);
        const prompt = input.trim();
        const textarea = (e.currentTarget as HTMLFormElement).querySelector('textarea');
        setInput('');
        if (textarea) textarea.style.height = 'auto';

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            text: prompt,
            sender: 'user',
            timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, userMessage]);

        try {
            // The backend determines which files were used and returns them in aiMessage.filesUsed
            // Do NOT overwrite it on the frontend.
            const aiMessage = await postChatMessage(activeChat.id, prompt, allFileIdsForPrompt);
            
            setMessages(prev => [...prev, aiMessage]);
            
            await refreshSessionFiles(activeChat.id);

            const updatedText = aiMessage.text.substring(0, 100) + (aiMessage.text.length > 100 ? '...' : '');
            setChatSessions(prev => prev.map(s => s.id === activeChat?.id ? { ...s, lastMessage: updatedText } : s));

        } catch (err: any) {
            console.error("Failed to post message:", err);
            const errorMessage: Message = { 
                id: `err-${Date.now()}`, 
                sender: 'ai', 
                text: `Sorry, I encountered an error. ${err.message}`, 
                timestamp: new Date().toISOString(),
                filesUsed: filesUsedForPrompt // Show context even on error
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsSending(false);
        }
    };

    const handleToggleActiveFile = (fileId: string) => {
        setActiveContextFileIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(fileId)) {
                newSet.delete(fileId);
            } else {
                newSet.add(fileId);
            }
            return newSet;
        });
    };
    
    if (!activeChat) {
        return (
            <NewChatInitializer 
                setActiveChat={setActiveChat}
                setChatSessions={setChatSessions}
                setMessages={setMessages}
                setSessionFiles={setSessionFiles}
                collections={collections}
            />
        );
    }
    
    return (
        <div className="chat-view">
            <header className="chat-header">
                <div className="chat-header-title-container">
                    <h2 title={activeChat.title}>{activeChat.title}</h2>
                </div>
                <div className="chat-header-actions">
                    <button onClick={() => setManageFilesModalOpen(true)} className="header-button manage-files-button">
                        <FileIcon />
                        <span>Manage Files</span>
                    </button>
                </div>
            </header>
            <div className="messages-list">
                {messages.map(message => (
                    <div key={message.id} className={`message-bubble ${message.sender}`}>
                        <div className="message-content">
                            <div className="markdown-content">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                            </div>
                            {message.sender === 'ai' && message.filesUsed && message.filesUsed.length > 0 && (
                                <div className="files-used-container">
                                    <FileIcon />
                                    <span>Using: {message.filesUsed.join(', ')}</span>
                                </div>
                            )}
                        </div>
                        <span className="message-timestamp">{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                ))}
                {isSending && (
                    <div className="message-bubble ai">
                        <div className="message-content">
                           <GeneratingStatusIndicator />
                        </div>
                    </div>
                )}
                 <div ref={messagesEndRef} />
            </div>
            {chatError && <p className="chat-error-message">{chatError}</p>}
            <form className="message-input-form" onSubmit={handleSendMessage}>
                <ActiveFilesBar 
                    allSessionFiles={sessionFiles}
                    activeFileIds={activeContextFileIds}
                    onToggleFile={handleToggleActiveFile}
                    onAddFiles={() => setManageFilesModalOpen(true)}
                />
                <div className="input-wrapper">
                    <textarea 
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); }}}
                        placeholder="Type your message, or ask about your files..."
                        rows={1}
                        aria-label="Chat message input"
                        disabled={isSending}
                    />
                    <button type="submit" aria-label="Send Message" disabled={!input.trim() || isSending}>
                        {isSending ? <SpinnerIcon /> : <SendIcon />}
                    </button>
                </div>
            </form>
            {isManageFilesModalOpen && (
                <ManageSessionFilesModal
                    isOpen={isManageFilesModalOpen}
                    onClose={() => setManageFilesModalOpen(false)}
                    sessionFiles={sessionFiles}
                    chatId={activeChat.id}
                    onSessionFilesChange={() => refreshSessionFiles(activeChat.id)}
                    showToast={showToast}
                />
            )}
        </div>
    );
};

const ActiveFilesBar: React.FC<{
    allSessionFiles: FileData[];
    activeFileIds: Set<string>;
    onToggleFile: (fileId: string) => void;
    onAddFiles: () => void;
}> = ({ allSessionFiles, activeFileIds, onToggleFile, onAddFiles }) => {
    if (allSessionFiles.length === 0) return null;
    
    return (
        <div className="active-files-bar">
            <span className="bar-title">Active Context:</span>
            <div className="files-pills-container">
                {allSessionFiles.map(file => {
                    const isActive = activeFileIds.has(file.id);
                    return (
                        <button
                            key={file.id}
                            className={`file-pill ${isActive ? 'active' : ''}`}
                            title={isActive ? `Deactivate ${file.name}` : `Activate ${file.name}`}
                            onClick={() => onToggleFile(file.id)}
                            aria-pressed={isActive}
                        >
                            <FileIcon />
                            <span>{file.name}</span>
                        </button>
                    )
                })}
            </div>
             <button className="add-files-button" onClick={onAddFiles} aria-label="Add or remove files from session">
                <PlusIcon />
            </button>
        </div>
    )
}

export default ChatView;
