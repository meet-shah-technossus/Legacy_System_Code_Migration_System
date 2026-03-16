import api from './api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A pending inline line comment attached to the current chat message */
export interface ChatLineComment {
  line_number: number;
  /** The user's typed annotation for this line */
  text: string;
  /** The actual source code at this line, captured from the Monaco editor */
  code_line?: string;
  code_type?: 'yaml' | 'generated_code';
}

export interface ChatRequest {
  messages: ChatMessage[];
  job_id?: number | null;
  performed_by?: string;
  /** Inline line comments from the editor — sent as context so the LLM knows which lines the user is asking about */
  line_comments?: ChatLineComment[];
}

export interface ChatResponse {
  reply: string;
  model: string;
}

export const chatApi = {
  send: (request: ChatRequest): Promise<ChatResponse> =>
    api.post<ChatResponse>('/chat', request).then((r) => r.data),
};
