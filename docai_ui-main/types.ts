
  export interface User {
    id: string;
    name: string;
    email: string;
    organizationName: string;
    designation: string;
    role: 'admin' | 'user';
  }

  export interface Memory {
    id: string;
    content: string;
  }

  export interface Message {
    id:string;
    text: string;
    sender: 'user' | 'ai';
    timestamp: string;
    filesUsed?: string[];
  }

  export interface ChatSession {
    id:string;
    title: string;
    lastMessage: string;
    timestamp: string;
  }

  export interface FileData {
    id: string;
    name: string;
    type: 'PDF' | 'DOCX' | string;
    timestamp: string;
    viewUrl?: string;
  }

  export interface Collection {
    id: string;
    name: string;
    files: FileData[];
  }

  export type ToastType = 'success' | 'error' | 'loading';

  export interface ToastState {
    id: number;
    message: string;
    type: ToastType;
  }

  export interface CollectionFileUsage {
    fileName: string;
    sessions: string[];
  }
