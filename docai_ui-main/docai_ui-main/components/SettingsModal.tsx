import React, { useState, useEffect } from 'react';
import { User, ToastType, Memory } from '../types';
import { 
    sendOtp,
    deleteAccount,
    getMemories, addMemory, updateMemory, deleteMemory,
    changePasswordInitiate,
    changePasswordConfirm,
} from '../services/api';
import { EditIcon, SaveIcon, SpinnerIcon, TrashIcon, SearchIcon } from './Icons';
import OtpInput from './OtpInput';
import { auth } from '../services/firebase';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

type SettingsTab = 'profile' | 'security' | 'customization' | 'danger';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User;
    showToast: (message: string, type: ToastType) => void;
    onLogout: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = (props) => {
    const { isOpen, onClose, user, showToast, onLogout } = props;
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
                <header className="modal-header">
                    <h2>Settings</h2>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </header>
                <div className="settings-modal-body">
                    <nav className="settings-tabs">
                        <button onClick={() => setActiveTab('profile')} className={activeTab === 'profile' ? 'active' : ''}>Profile</button>
                        <button onClick={() => setActiveTab('security')} className={activeTab === 'security' ? 'active' : ''}>Security</button>
                        <button onClick={() => setActiveTab('customization')} className={activeTab === 'customization' ? 'active' : ''}>Customization</button>
                        <button onClick={() => setActiveTab('danger')} className={activeTab === 'danger' ? 'active' : ''}>Danger Zone</button>
                    </nav>
                    <div className="settings-content">
                        {activeTab === 'profile' && <ProfileSettings user={user} />}
                        {activeTab === 'security' && <SecuritySettings showToast={showToast} onClose={onClose} />}
                        {activeTab === 'customization' && <CustomizationSettings showToast={showToast} />}
                        {activeTab === 'danger' && <DangerZoneSettings showToast={showToast} onLogout={onLogout} />}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Profile Settings Component ---
const ProfileSettings: React.FC<{ user: User }> = ({ user }) => {
    return (
        <div className="settings-section">
            <h3>Profile Information</h3>
            <div>
                <dl className="profile-info-grid">
                    <dt>Full Name</dt>
                    <dd><span>{user.name}</span></dd>
                    <dt>Work Email</dt>
                    <dd>{user.email}</dd>
                    <dt>Organization</dt>
                    <dd>{user.organizationName}</dd>
                    <dt>Designation</dt>
                    <dd><span>{user.designation}</span></dd>
                </dl>
            </div>
        </div>
    );
};

// --- Security Settings Component (newly integrated) ---
type ChangePasswordStage = 'oldPassword' | 'otp' | 'newPassword';

const SecuritySettings: React.FC<{showToast: (m:string,t:ToastType)=>void; onClose: () => void;}> = ({ showToast, onClose }) => {
    const [stage, setStage] = useState<ChangePasswordStage>('oldPassword');
    const [oldPassword, setOldPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleStageSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            if (stage === 'oldPassword') {
                const user = auth.currentUser;
                if (!user || !user.email) throw new Error("User not found.");
                
                const credential = EmailAuthProvider.credential(user.email, oldPassword);
                await reauthenticateWithCredential(user, credential);
                
                await changePasswordInitiate();
                showToast("Verification successful. An OTP has been sent to your email.", "success");
                setStage('otp');

            } else if (stage === 'otp') {
                setStage('newPassword'); // OTP is verified with the new password

            } else if (stage === 'newPassword') {
                if (newPassword.length < 6) {
                    throw new Error("Password must be at least 6 characters long.");
                }
                if (newPassword !== confirmPassword) {
                    throw new Error("New passwords do not match.");
                }
                await changePasswordConfirm({ otp, newPassword });
                showToast("Password changed successfully!", "success");
                onClose();
            }
        } catch (err: any) {
            let friendlyMessage = err.message || "An unexpected error occurred.";
            if (err.code === 'auth/wrong-password') {
                friendlyMessage = 'The current password you entered is incorrect.';
            } else if (err.code === 'auth/too-many-requests') {
                friendlyMessage = 'Too many failed attempts. Please try again later.';
            }
            setError(friendlyMessage);
        } finally {
            setIsLoading(false);
        }
    };
    
     const getButtonText = () => {
        if(isLoading) return 'Loading...';
        switch (stage) {
            case 'oldPassword': return 'Verify & Send OTP';
            case 'otp': return 'Verify OTP';
            case 'newPassword': return 'Set New Password';
            default: return 'Continue';
        }
    }

    return (
        <div className="settings-section">
            <h3>Change Password</h3>
             <form onSubmit={handleStageSubmit}>
                {stage === 'oldPassword' && (
                    <div className="input-group">
                        <label htmlFor="old-password">Current Password</label>
                        <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-0.5rem', marginBottom: '1rem'}}>For your security, please re-enter your current password to begin.</p>
                        <input id="old-password" type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required autoFocus/>
                    </div>
                )}
                {stage === 'otp' && (
                    <div className="input-group">
                        <label htmlFor="otp">One-Time Password (OTP)</label>
                         <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-0.5rem', marginBottom: '1rem'}}>Enter the 6-digit code sent to your email address.</p>
                        <OtpInput value={otp} onChange={setOtp} />
                    </div>
                )}
                {stage === 'newPassword' && (
                    <>
                        <div className="input-group">
                            <label htmlFor="new-password">New Password</label>
                            <input id="new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                        </div>
                        <div className="input-group">
                            <label htmlFor="confirm-password">Confirm New Password</label>
                            <input id="confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                        </div>
                    </>
                )}
                {error && <p className="error-message" style={{marginTop: '1rem'}}>{error}</p>}
                
                <div className="modal-actions" style={{justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', marginTop: '1.5rem'}}>
                    <button type="button" className="button-secondary" onClick={onClose} disabled={isLoading}>Cancel</button>
                    <button type="submit" className="button-primary" disabled={isLoading}>
                        {isLoading && <SpinnerIcon />}
                        {getButtonText()}
                    </button>
                </div>
            </form>
        </div>
    );
};

// --- Customization Settings Component ---
const MAX_MEMORIES = 50;
const CustomizationSettings: React.FC<{showToast: (m:string,t:ToastType)=>void}> = ({showToast}) => {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newMemory, setNewMemory] = useState('');
    const [editingMemory, setEditingMemory] = useState<{id: string, content: string} | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchMemories = async () => {
            try {
                const data = await getMemories();
                setMemories(data);
            } catch (err: any) {
                showToast(`Could not load memories: ${err.message}`, 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchMemories();
    }, [showToast]);

    const handleAddMemory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMemory.trim()) return;
        try {
            const addedMemory = await addMemory(newMemory);
            setMemories([...memories, addedMemory]);
            setNewMemory('');
            showToast('Memory added!', 'success');
        } catch(err: any) {
            showToast(`Error adding memory: ${err.message}`, 'error');
        }
    };
    
    const handleUpdateMemory = async (id: string, content: string) => {
        if (!content.trim()) return;
         try {
            const updated = await updateMemory(id, content);
            setMemories(memories.map(m => m.id === id ? updated : m));
            setEditingMemory(null);
            showToast('Memory updated!', 'success');
        } catch(err: any) {
            showToast(`Error updating memory: ${err.message}`, 'error');
        }
    };
    
    const handleDeleteMemory = async (id: string) => {
        try {
            await deleteMemory(id);
            setMemories(memories.filter(m => m.id !== id));
            showToast('Memory deleted!', 'success');
        } catch(err: any) {
            showToast(`Error deleting memory: ${err.message}`, 'error');
        }
    };

    const filteredMemories = memories.filter(m =>
        m.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="settings-section">
            <h3>AI Memory</h3>
            <p style={{marginTop: '-1rem', color: 'var(--text-secondary)'}}>Customize the AI's behavior by providing persistent instructions or facts.</p>
            <div className="memory-customization-header">
                <div className="memory-progress-container">
                    <div className="progress-bar-label">
                        <span>Memory Slots Used</span>
                        <span>{memories.length} / {MAX_MEMORIES}</span>
                    </div>
                    <div className="progress-bar">
                        <div className="progress-bar-inner" style={{width: `${(memories.length/MAX_MEMORIES)*100}%`}}></div>
                    </div>
                </div>
            </div>
            
            <form onSubmit={handleAddMemory} className="add-memory-form">
                <div className="input-group">
                    <label htmlFor="new-memory">Add a new memory</label>
                    <textarea 
                        id="new-memory" 
                        value={newMemory} 
                        onChange={e => setNewMemory(e.target.value)}
                        placeholder="e.g., I prefer responses to be structured with bullet points."
                        rows={3}
                        maxLength={500}
                        disabled={memories.length >= MAX_MEMORIES}
                    />
                    <span className="char-counter">{newMemory.length} / 500</span>
                </div>
                <button type="submit" className="button-primary" style={{width: '100%'}} disabled={!newMemory.trim() || memories.length >= MAX_MEMORIES}>Add Memory</button>
            </form>
            
            <h4 className="manage-memories-title">Manage Memories</h4>
             <div className="customization-search search-bar">
                <SearchIcon />
                <input
                    type="text"
                    placeholder="Search memories..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            
            {isLoading ? <p>Loading memories...</p> : (
                <div className="memory-list-container">
                    <ul className="memory-list">
                        {filteredMemories.map(memory => (
                            <li key={memory.id} className="memory-item">
                                {editingMemory?.id === memory.id ? (
                                    <>
                                        <textarea
                                            value={editingMemory.content}
                                            onChange={e => setEditingMemory({...editingMemory, content: e.target.value})}
                                            className="memory-content"
                                            maxLength={500}
                                            autoFocus
                                        />
                                        <div className="memory-actions">
                                            <button className="edit-button" onClick={() => handleUpdateMemory(memory.id, editingMemory.content)}><SaveIcon/></button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="memory-content">{memory.content}</p>
                                        <div className="memory-actions">
                                            <button className="edit-button" onClick={() => setEditingMemory({id: memory.id, content: memory.content})}><EditIcon /></button>
                                            <button className="delete-button" onClick={() => handleDeleteMemory(memory.id)}><TrashIcon /></button>
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
                        {memories.length > 0 && filteredMemories.length === 0 && <p style={{textAlign: 'center', padding: '1rem'}}>No memories match your search.</p>}
                        {memories.length === 0 && <p style={{textAlign: 'center', padding: '1rem'}}>You have no saved memories.</p>}
                    </ul>
                </div>
            )}
        </div>
    );
};

// --- Danger Zone Component ---
const DangerZoneSettings: React.FC<{showToast: (m:string,t:ToastType)=>void; onLogout: () => void;}> = ({showToast, onLogout}) => {
    // State for account deletion
    const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [deleteOtpStep, setDeleteOtpStep] = useState(false);
    const [deleteOtp, setDeleteOtp] = useState('');
    

    const handleRequestDeleteOtp = async () => {
        setIsDeleting(true);
        setDeleteError('');
        try {
            await sendOtp({ purpose: 'delete_account' });
            showToast('OTP sent to your email for account deletion.', 'success');
            setDeleteOtpStep(true);
        } catch (err: any) {
            const message = err.message || 'Failed to send OTP.';
            setDeleteError(message);
            showToast(`Error: ${message}`, 'error');
        } finally {
            setIsDeleting(false);
        }
    };
    
    const handleDelete = async () => {
        if (!isDeleteConfirmed) return;

        setIsDeleting(true);
        setDeleteError('');
        try {
            await deleteAccount(deleteOtp);
            showToast('Account deleted successfully. You will be logged out.', 'success');
            setTimeout(onLogout, 2000);
        } catch (err: any) {
            const message = err.message || 'An error occurred.';
            setDeleteError(message);
            showToast(`Error: ${message}`, 'error');
            setIsDeleting(false);
        }
    };
    
    return (
        <div className="settings-section">
            <h3>Danger Zone</h3>
            <div className="danger-zone">
                <h4>Delete this account</h4>
                <p>Once you delete your account, there is no going back. All of your data, including chat history and uploaded files, will be permanently erased.</p>
                
                <div className="confirmation-checkbox-group">
                    <input type="checkbox" id="delete-confirm" checked={isDeleteConfirmed} onChange={e => setIsDeleteConfirmed(e.target.checked)} disabled={isDeleting} />
                    <label htmlFor="delete-confirm">I understand this action is permanent and cannot be undone.</label>
                </div>

                {deleteOtpStep && (
                  <div className="input-group" style={{marginTop: '1rem'}}>
                    <label htmlFor="otp">Enter Deletion OTP</label>
                    <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-0.5rem'}}>For your security, please enter the one-time password sent to your email.</p>
                    <OtpInput value={deleteOtp} onChange={setDeleteOtp} />
                  </div>
                )}

                {deleteError && <p className="error-message">{deleteError}</p>}
                
                <div className="modal-actions" style={{justifyContent: 'flex-start', paddingTop: '1rem' }}>
                    {!deleteOtpStep ? (
                        <button className="button-primary" onClick={handleRequestDeleteOtp} disabled={!isDeleteConfirmed || isDeleting} style={{backgroundColor: 'var(--danger-color)'}}>
                            {isDeleting ? <SpinnerIcon /> : null}
                            {isDeleting ? 'Sending OTP...' : 'Request Deletion OTP'}
                        </button>
                    ) : (
                        <button className="button-primary" onClick={handleDelete} disabled={deleteOtp.length < 6 || isDeleting} style={{backgroundColor: 'var(--danger-color)'}}>
                            {isDeleting ? <SpinnerIcon /> : null}
                            {isDeleting ? 'Deleting...' : 'Delete Account Permanently'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SettingsModal;