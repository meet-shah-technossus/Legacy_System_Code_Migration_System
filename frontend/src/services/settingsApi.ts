import api from './api';

export interface LLMConfig {
  openai_model: string;
  anthropic_model: string;
  default_llm_provider: 'OPENAI' | 'ANTHROPIC';
}

export interface LLMConfigUpdate {
  openai_model?: string;
  anthropic_model?: string;
  default_llm_provider?: 'OPENAI' | 'ANTHROPIC';
}

export interface APIKeysResponse {
  /** Masked OpenAI key, e.g. "sk-proj-Ab****" */
  openai_api_key: string;
  /** Masked Anthropic key */
  anthropic_api_key: string;
  /** "db" | "env" | "not_set" */
  openai_source: string;
  /** "db" | "env" | "not_set" */
  anthropic_source: string;
}

export interface APIKeysUpdate {
  /** Pass an empty string to clear the DB override and fall back to env */
  openai_api_key?: string;
  anthropic_api_key?: string;
}

export const settingsApi = {
  getLLMConfig: async (): Promise<LLMConfig> => {
    const response = await api.get<LLMConfig>('/settings/llm');
    return response.data;
  },

  updateLLMConfig: async (update: LLMConfigUpdate): Promise<LLMConfig> => {
    const response = await api.put<LLMConfig>('/settings/llm', update);
    return response.data;
  },

  getAPIKeys: async (): Promise<APIKeysResponse> => {
    const response = await api.get<APIKeysResponse>('/settings/keys');
    return response.data;
  },

  updateAPIKeys: async (update: APIKeysUpdate): Promise<APIKeysResponse> => {
    const response = await api.put<APIKeysResponse>('/settings/keys', update);
    return response.data;
  },
};
