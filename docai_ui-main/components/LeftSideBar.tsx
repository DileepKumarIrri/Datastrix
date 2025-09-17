
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { updateChatSession } from '../services/api';
import { ChatSession, ToastType, User } from '../types';
import { NewChatIcon, SearchIcon, SettingsIcon, LogoutIcon, TrashIcon, EditIcon, SidebarCollapseIcon, SidebarExpandIcon } from './Icons';

interface LeftSideBarProps {
  currentUser: User;
  chatSessions: ChatSession[];
  activeChat: ChatSession | null;
  onSelectChat: (session: ChatSession) => void;
  onNewChat: () => void;
  onLogout: () => void;
  onDeleteChat: (session: ChatSession) => void;
  setChatSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  setActiveChat: React.Dispatch<React.SetStateAction<ChatSession | null>>;
  showToast: (message: string, type: ToastType) => number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSettings: () => void;
}

const LeftSideBar: React.FC<LeftSideBarProps> = (props) => {
  const { 
    currentUser, chatSessions, activeChat, onSelectChat, onNewChat, onLogout, onDeleteChat,
    setChatSessions, setActiveChat, showToast, isCollapsed, onToggleCollapse, onOpenSettings
  } = props;
  
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [newTitleText, setNewTitleText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const historyRef = useRef<HTMLElement>(null);

  const handleStartEditing = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setNewTitleText(session.title);
  };

  const handleConfirmEdit = async (sessionId: string) => {
    if (!newTitleText.trim() || newTitleText.trim() === activeChat?.title) {
        setEditingSessionId(null);
        return;
    }

    try {
        const updatedSession = await updateChatSession(sessionId, newTitleText.trim());
        setActiveChat(updatedSession);
        setChatSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
        showToast("Chat title updated.", "success");
    } catch (err: any) {
        showToast(`Failed to update title: ${err.message}`, "error");
    } finally {
        setEditingSessionId(null);
    }
  };

  const filteredSessions = chatSessions.filter(session => 
      session.title.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const handleScrollAndResize = useCallback(() => {
    const el = historyRef.current;
    if (!el || !isCollapsed) {
        setShowTopFade(false);
        setShowBottomFade(false);
        return;
    }

    const hasScroll = el.scrollHeight > el.clientHeight;
    // Use a small threshold to account for subpixel rendering issues
    const isAtTop = el.scrollTop < 5; 
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 5;

    setShowTopFade(hasScroll && !isAtTop);
    setShowBottomFade(hasScroll && !isAtBottom);
  }, [isCollapsed]);

  useEffect(() => {
    const el = historyRef.current;
    if (!el) return;

    // Run check on mount and when dependencies change
    handleScrollAndResize();

    const resizeObserver = new ResizeObserver(handleScrollAndResize);
    resizeObserver.observe(el);
    el.addEventListener('scroll', handleScrollAndResize);

    // Cleanup
    return () => {
        resizeObserver.disconnect();
        el.removeEventListener('scroll', handleScrollAndResize);
    };
    // Re-run this effect if the list of chats or collapsed state changes
  }, [chatSessions, isCollapsed, handleScrollAndResize]);

  const historyClassName = [
    'chat-history',
    showTopFade ? 'fade-top' : '',
    showBottomFade ? 'fade-bottom' : ''
  ].filter(Boolean).join(' ');


  return (
    <aside className={`left-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-top">
        <button className="sidebar-button new-chat-button" onClick={onNewChat} title={isCollapsed ? "New Chat" : ""}>
          <NewChatIcon />
          {!isCollapsed && <span>New Chat</span>}
        </button>
        {!isCollapsed && (
            <div className="search-bar">
              <SearchIcon />
              <input 
                type="text"
                placeholder="Search history..."
                aria-label="Search chat history"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
        )}
      </div>
      <nav ref={historyRef} className={historyClassName} aria-label="Chat History">
        {/* The fade is handled by CSS pseudo-elements, so no JSX needed here */}
        <ul>
          {filteredSessions.map((session) => (
            <li
              key={session.id}
              className={activeChat?.id === session.id ? 'active' : ''}
              onClick={() => editingSessionId !== session.id && onSelectChat(session)}
              role="button"
              tabIndex={0}
              aria-current={activeChat?.id === session.id ? 'page' : undefined}
              onKeyDown={(e) => e.key === 'Enter' && editingSessionId !== session.id && onSelectChat(session)}
              title={isCollapsed ? session.title : undefined}
            >
              <div className="session-avatar" aria-hidden="true">
                {session.title.charAt(0).toUpperCase()}
              </div>
              {editingSessionId === session.id ? (
                 <input
                    type="text"
                    value={newTitleText}
                    onChange={(e) => setNewTitleText(e.target.value)}
                    onBlur={() => handleConfirmEdit(session.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmEdit(session.id)}
                    className="session-edit-input"
                    autoFocus
                 />
              ) : (
                <>
                  <div className="session-content">
                    <div className="session-title" title={session.title}>{session.title}</div>
                  </div>
                  <div className="session-actions">
                    <button 
                      className="edit-button"
                      onClick={(e) => { e.stopPropagation(); handleStartEditing(session); }}
                      aria-label={`Edit chat title: ${session.title}`}
                    >
                      <EditIcon />
                    </button>
                    <button 
                      className="delete-button"
                      onClick={(e) => { e.stopPropagation(); onDeleteChat(session); }}
                      aria-label={`Delete chat session: ${session.title}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-bottom">
        <div className="user-profile" title={isCollapsed ? currentUser?.name || currentUser?.email : ''}>
          <div className="user-avatar" aria-hidden="true">{currentUser?.name?.charAt(0) || currentUser?.email?.charAt(0)}</div>
          {!isCollapsed && (
            <div className="user-details">
              <span className="user-name">{currentUser?.name || 'User'}</span>
            </div>
          )}
        </div>
        <div className="sidebar-actions">
           <button className="sidebar-action-button" onClick={onOpenSettings} title={isCollapsed ? 'Settings' : ''}>
            <SettingsIcon />
            <span>Settings</span>
          </button>
          <button className="sidebar-action-button" onClick={onLogout} title={isCollapsed ? 'Logout' : ''}>
            <LogoutIcon />
            <span>Logout</span>
          </button>
          <div className="sidebar-collapse-action">
            <button className="sidebar-action-button" onClick={onToggleCollapse} title={isCollapsed ? 'Expand' : 'Collapse'}>
              {isCollapsed ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
              <span className="collapse-text">Collapse</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default LeftSideBar;
