import { ChatSession, Collection, FileData, Message, User, Memory, CollectionFileUsage } from '../types';
import { auth } from './firebase';

const API_BASE_URL = 'http://localhost:3001/api';

const getAuthHeaders = async (): Promise<HeadersInit> => {
    const user = auth.currentUser;
    if (user) {
        const token = await user.getIdToken();
        return { 'Authorization': `Bearer ${token}` };
    }
    return {};
};

const handleResponse = async (response: Response) => {
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { message: response.statusText };
        }
        // Augment the error object with the status code for better handling in the frontend.
        const error: Error & { status?: number } = new Error(errorData.message || 'An unknown error occurred.');
        error.status = response.status;
        throw error;
    }
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return response.json();
    }
    // Handle cases where the response might be empty JSON ({}) or just text
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch (e) {
        // If it's not JSON, return the raw text (though this should be rare for this API)
        return text;
    }
};


// --- API FUNCTIONS ---

// POST /api/auth/otp/send - Request an OTP for a given purpose (e.g., delete_account)
export const sendOtp = async (data: { email?: string, purpose: string }): Promise<{ success: boolean }> => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (auth.currentUser) {
        Object.assign(headers, await getAuthHeaders());
    }
    const response = await fetch(`${API_BASE_URL}/auth/otp/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
    });
    return handleResponse(response);
};

// POST /api/auth/otp/verify - Verify an OTP for the signup flow
export const verifyOtp = async (data: { email: string, otp: string, purpose:string }): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
};

// --- Password Management ---

// POST /api/auth/password/forgot-initiate
export const forgotPasswordInitiate = async (email: string): Promise<{ success: boolean, message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/password/forgot-initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return handleResponse(response);
};

// POST /api/auth/password/forgot-confirm
export const forgotPasswordConfirm = async (data: { email: string, otp: string, newPassword: string }): Promise<{ success: boolean, message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/password/forgot-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

// POST /api/auth/password/change-initiate
export const changePasswordInitiate = async (): Promise<{ success: boolean, message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/password/change-initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({}), // Empty body, user is identified by token
  });
  return handleResponse(response);
};

// POST /api/auth/password/change-confirm
export const changePasswordConfirm = async (data: { otp: string, newPassword: string }): Promise<{ success: boolean, message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/password/change-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};


// POST /api/auth/register - Create user profile in our DB after Firebase signup
export const registerProfile = async (data: { name: string, organizationName: string, designation: string }): Promise<{ user: User }> => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(await getAuthHeaders()),
        },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
};

// POST /api/chat/session
export const createChatSession = async (name: string): Promise<ChatSession> => {
    const response = await fetch(`${API_BASE_URL}/chat/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ name }),
    });
    return handleResponse(response);
};

// PUT /api/chat/session/:id
export const updateChatSession = async (sessionId: string, name: string): Promise<ChatSession> => {
    const response = await fetch(`${API_BASE_URL}/chat/session/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ name }),
    });
    return handleResponse(response);
}

// GET /api/chat/sessions
export const getChatHistory = async (page: number = 1): Promise<ChatSession[]> => {
    const response = await fetch(`${API_BASE_URL}/chat/sessions?page=${page}`, {
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// GET /api/chat/session/:chatId/messages
export const getChatMessages = async (chatId: string, page: number = 1): Promise<Message[]> => {
    const response = await fetch(`${API_BASE_URL}/chat/session/${chatId}/messages?page=${page}`, {
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// GET /api/chat/session/:chatId/files
export const getChatSessionFiles = async (chatId: string): Promise<FileData[]> => {
    const response = await fetch(`${API_BASE_URL}/chat/session/${chatId}/files`, {
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
}

// POST /api/chat/session/:chatId/files
export const addFilesToSession = async (chatId: string, fileIds: string[]): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/chat/session/${chatId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ fileIds }),
    });
    return handleResponse(response);
};

// DELETE /api/chat/session/:chatId/file/:fileId
export const removeFileFromSession = async (chatId: string, fileId: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/chat/session/${chatId}/file/${fileId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// GET /api/files/list
export const getFilesAndCollections = async (page: number = 1): Promise<Collection[]> => {
    const response = await fetch(`${API_BASE_URL}/files/list?page=${page}`, {
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// POST /api/files/upload
export const uploadFile = async (formData: FormData): Promise<{ success: boolean; file: FileData }> => {
    const response = await fetch(`${API_BASE_URL}/files/upload`, {
        method: 'POST',
        headers: await getAuthHeaders(), // Note: Don't set Content-Type, browser does it for FormData
        body: formData,
    });
    return handleResponse(response);
};

// POST /api/chat/message
export const postChatMessage = async (sessionId: string, prompt: string, fileIds: string[]): Promise<Message> => {
     const response = await fetch(`${API_BASE_URL}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ sessionId, prompt, fileIds }),
    });
    return handleResponse(response);
};

// DELETE /api/chat/session/:chatId
export const deleteChat = async (chatId: string): Promise<{ success: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/chat/session/${chatId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// DELETE /api/files/:fileId
export const deleteFile = async (fileId: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// GET /api/files/:fileId/sessions
export const getFileUsage = async (fileId: string): Promise<string[]> => {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/sessions`, {
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// POST /api/chat/generate-title
export const generateChatTitle = async (prompt: string): Promise<{ title: string }> => {
    const response = await fetch(`${API_BASE_URL}/chat/generate-title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ prompt }),
    });
    return handleResponse(response);
};

// DELETE /api/files/collections/:collectionName
export const deleteCollection = async (collectionName: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/files/collections/${collectionName}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// GET /api/files/collections/:collectionName/usage
export const getCollectionUsage = async (collectionName: string): Promise<CollectionFileUsage[]> => {
    const response = await fetch(`${API_BASE_URL}/files/collections/${collectionName}/usage`, {
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// GET /api/auth/profile
export const getUserProfile = async (): Promise<User> => {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// PUT /api/user/profile
export const updateUserProfile = async (data: { name?: string; designation?: string }): Promise<{ success: boolean, user: User }> => {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
};

// DELETE /api/user/account - Requires OTP for verification
export const deleteAccount = async (otp: string): Promise<{ success: boolean, message: string }> => {
    const response = await fetch(`${API_BASE_URL}/auth/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ otp }),
    });
    return handleResponse(response);
};

// DELETE /api/auth/account/cancel-signup - Cleanup abandoned signup
export const cancelSignup = async (): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/auth/account/cancel-signup`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// --- MEMORIES ---
// GET /api/memories
export const getMemories = async (): Promise<Memory[]> => {
    const response = await fetch(`${API_BASE_URL}/memories`, {
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// POST /api/memories
export const addMemory = async (content: string): Promise<Memory> => {
    const response = await fetch(`${API_BASE_URL}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ content }),
    });
    return handleResponse(response);
};

// PUT /api/memories/:id
export const updateMemory = async (memoryId: string, content: string): Promise<Memory> => {
    const response = await fetch(`${API_BASE_URL}/memories/${memoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ content }),
    });
    return handleResponse(response);
};

// DELETE /api/memories/:id
export const deleteMemory = async (memoryId: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/memories/${memoryId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
    });
    return handleResponse(response);
};

// Helper for logout (though now handled by App.tsx)
export const logoutUser = () => {
    return auth.signOut();
};