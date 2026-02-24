import api from './api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  job_id?: number | null;
  performed_by?: string;
}

export interface ChatResponse {
  reply: string;
  model: string;
}

export const chatApi = {
  send: (request: ChatRequest): Promise<ChatResponse> =>
    api.post<ChatResponse>('/chat', request).then((r) => r.data),
};
