
import React, { useState, useEffect, useCallback } from 'react';
import LeftSideBar from './LeftSideBar';
import ChatView from './ChatView';
import RightSideBar from './RightSideBar';
import ConfirmationModal from './ConfirmationModal';
import Toast from './Toast';
import SettingsModal from './SettingsModal';
import { ChatSession, Collection, Message, FileData, ToastState, ToastType, User } from '../types';
import { logoutUser, getChatHistory, getFilesAndCollections, getChatMessages, deleteChat, getChatSessionFiles } from '../services/api';

interface MainAppProps {
  user: User;
  onLogout: () => void;
}

const MainApp: React.FC<MainAppProps> = ({ user, onLogout }) => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChat, setActiveChat] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sessionFiles, setSessionFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [deletionTarget, setDeletionTarget] = useState<ChatSession | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  const [isLeftSideBarCollapsed, setIsLeftSideBarCollapsed] = useState(false);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User>(user);

  // --- STATE PERSISTENCE ---
  // This effect saves the current chat state to sessionStorage whenever it changes.
  useEffect(() => {
    // We don't save during the initial data fetch to avoid overwriting the stored state
    // with the initial null state before it has a chance to be restored.
    if (loading) return;

    if (activeChat) {
      sessionStorage.setItem('lastActiveChatId', activeChat.id);
    } else {
      // If not loading and activeChat is null, user is on the "New Chat" screen.
      sessionStorage.setItem('lastActiveChatId', 'new');
    }
  }, [activeChat, loading]);


  const showToast = useCallback((message: string, type: ToastType): number => {
    const id = Date.now();
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
    return id;
  }, []);

  const hideToast = useCallback((id: number) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  }, []);


  const fetchSessionData = async (session: ChatSession | null) => {
    if (!session) {
      setMessages([]);
      setSessionFiles([]);
      return;
    }
    try {
      setMessages([]);
      setSessionFiles([]);
      const [fetchedMessages, fetchedFiles] = await Promise.all([
        getChatMessages(session.id),
        getChatSessionFiles(session.id)
      ]);
      setMessages(fetchedMessages);
      setSessionFiles(fetchedFiles);
    } catch (err) {
        console.error("Failed to fetch data for chat:", session.id, err);
        showToast("Could not load data for the selected chat.", "error");
        setMessages([]);
        setSessionFiles([]);
    }
  };

  const handleSelectChat = (session: ChatSession) => {
    if (activeChat?.id === session.id) return;
    setActiveChat(session);
    fetchSessionData(session);
  }

  const handleNewChat = () => {
    setActiveChat(null);
    setMessages([]);
    setSessionFiles([]);
  };

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [history, collectionsData] = await Promise.all([
        getChatHistory(),
        getFilesAndCollections(),
      ]);
      setChatSessions(history);
      setCollections(collectionsData);
      
      const lastActiveChatId = sessionStorage.getItem('lastActiveChatId');
      const sessionToRestore = lastActiveChatId ? history.find(s => s.id === lastActiveChatId) : undefined;

      if (lastActiveChatId === 'new') {
        handleNewChat();
      } else if (sessionToRestore) {
        // Restore the specific session
        setActiveChat(sessionToRestore);
        await fetchSessionData(sessionToRestore);
      } else if (history.length > 0) {
        // Fallback to the most recent chat
        const firstChat = history[0];
        setActiveChat(firstChat);
        await fetchSessionData(firstChat);
      } else {
        // Fallback to the new chat screen if there's no history
        handleNewChat();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch initial data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const refreshCollections = async () => {
    try {
        const collectionsData = await getFilesAndCollections();
        setCollections(collectionsData);
    } catch (err: any) {
        showToast(err.message || 'Failed to refresh files.', 'error');
        console.error(err);
    }
  };

  const refreshSessionFiles = async (sessionId: string) => {
      try {
        const files = await getChatSessionFiles(sessionId);
        setSessionFiles(files);
      } catch (err: any) {
          showToast(`Could not refresh session files: ${err.message}`, 'error');
      }
  };
  
  const handleDeleteChatRequest = (session: ChatSession) => {
      setDeletionTarget(session);
  };
  
  const handleConfirmDelete = async () => {
      if (!deletionTarget) return;

      setIsDeleting(true);
      setError(null);
      try {
          await deleteChat(deletionTarget.id);

          const newChatSessions = chatSessions.filter(s => s.id !== deletionTarget.id);
          setChatSessions(newChatSessions);

          if (activeChat?.id === deletionTarget.id) {
              if (newChatSessions.length > 0) {
                  handleSelectChat(newChatSessions[0]);
              } else {
                  handleNewChat();
              }
          }
          setDeletionTarget(null);
      } catch (err: any) {
          showToast(err.message || 'Failed to delete chat session.', 'error');
          console.error(err);
      } finally {
          setIsDeleting(false);
      }
  };

  const handleLogout = () => {
      logoutUser();
      onLogout();
  };

  // A more robust loading state check. It shows the skeleton only on the very first load
  // before any chat sessions have been fetched.
  if (loading && chatSessions.length === 0 && !error) {
      return (
        <div className="workspace-loader">
          <div className="skeleton-item sidebar-left-skeleton"></div>
          <div className="skeleton-item main-content-skeleton">
            <div className="skeleton-item skeleton-header"></div>
            <div className="skeleton-item skeleton-message-user"></div>
            <div className="skeleton-item skeleton-message-ai"></div>
            <div className="skeleton-item skeleton-message-user"></div>
            <div className="skeleton-item skeleton-input"></div>
          </div>
          <div className="skeleton-item sidebar-right-skeleton"></div>
        </div>
      );
  }
  
  if (error) {
      return (
        <div className="loading-container error-container">
          <span>{error}</span>
          <button onClick={fetchInitialData} className="button-primary" style={{ width: 'auto' }}>Retry</button>
        </div>
      );
  }

  return (
    <>
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} onDismiss={hideToast} />
        ))}
      </div>
      <div className="main-app-container">
        <LeftSideBar 
          currentUser={currentUser}
          chatSessions={chatSessions} 
          activeChat={activeChat}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onLogout={handleLogout}
          onDeleteChat={handleDeleteChatRequest}
          setChatSessions={setChatSessions}
          setActiveChat={setActiveChat}
          showToast={showToast}
          isCollapsed={isLeftSideBarCollapsed}
          onToggleCollapse={() => setIsLeftSideBarCollapsed(prev => !prev)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
        />
        <main className="chat-view-container">
          <ChatView 
              activeChat={activeChat}
              messages={messages}
              sessionFiles={sessionFiles}
              setMessages={setMessages}
              setActiveChat={setActiveChat}
              setChatSessions={setChatSessions}
              setSessionFiles={setSessionFiles}
              refreshSessionFiles={refreshSessionFiles}
              showToast={showToast}
              collections={collections}
          />
        </main>
        <RightSideBar 
          collections={collections}
          onRefreshCollections={refreshCollections}
          showToast={showToast}
          hideToast={hideToast}
          isCollapsed={isRightSidebarCollapsed}
          onToggleCollapse={() => setIsRightSidebarCollapsed(prev => !prev)}
        />
      </div>
      <ConfirmationModal
        isOpen={!!deletionTarget}
        onClose={() => setDeletionTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Chat Session"
        message={`Are you sure you want to permanently delete the chat session "${deletionTarget?.title}"? This action cannot be undone.`}
        isLoading={isDeleting}
      />
      {isSettingsModalOpen && currentUser && (
        <SettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            user={currentUser}
            showToast={showToast}
            onLogout={handleLogout}
        />
      )}
    </>
  );
};

export default MainApp;
