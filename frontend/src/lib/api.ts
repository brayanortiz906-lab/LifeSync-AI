// API Client para backend FastAPI
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    // Recuperar token del localStorage si existe
    this.token = localStorage.getItem('access_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('access_token', token);
    } else {
      localStorage.removeItem('access_token');
    }
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `Error ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Auth endpoints (delegados a Supabase directamente, pero útiles para refresh)
  async refreshToken(refreshToken: string) {
    return this.request<{access_token: string; refresh_token: string}>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({refresh_token: refreshToken}),
    });
  }

  // Chat endpoints
  async createChat(data: {titulo?: string; modelo?: string; system_prompt?: string}) {
    return this.request<{id: string; titulo?: string; modelo: string; creado_at: string; actualizado_at: string; mensaje_count: number}>('/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getChats(limit = 50, offset = 0) {
    return this.request<Array<{id: string; titulo?: string; modelo: string; creado_at: string; actualizado_at: string; mensaje_count: number}>>(`/chat?limit=${limit}&offset=${offset}`);
  }

  async getChat(chatId: string) {
    return this.request<{id: string; titulo?: string; modelo: string; system_prompt?: string; creado_at: string; actualizado_at: string; mensajes: Array<{id: string; rol: string; contenido: string; tokens_entrada?: number; tokens_salida?: number; modelo?: string; creado_at: string}>}>(`/chat/${chatId}`);
  }

  async sendMessage(chatId: string, content: string, stream = false) {
    if (stream) {
      // Streaming via SSE
      const response = await fetch(`${this.baseURL}/chat/${chatId}/messages?stream=true`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({contenido: content, rol: 'user'}),
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      return response.body?.getReader();
    }
    
    return this.request<{id: string; rol: string; contenido: string; tokens_entrada?: number; tokens_salida?: number; modelo?: string; creado_at: string}>(`/chat/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({contenido: content, rol: 'user'}),
    });
  }

  async deleteChat(chatId: string) {
    return this.request(`/chat/${chatId}`, {method: 'DELETE'});
  }

  async updateChat(chatId: string, data: {titulo?: string; modelo?: string; system_prompt?: string}) {
    return this.request(`/chat/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Events
  async getEvents(params: {desde?: string; hasta?: string; tipo?: string; limit?: number; offset?: number} = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && search.append(k, String(v)));
    return this.request<Array<any>>(`/events?${search.toString()}`);
  }

  async createEvent(data: any) {
    return this.request<any>('/events', {method: 'POST', body: JSON.stringify(data)});
  }

  async updateEvent(id: string, data: any) {
    return this.request<any>(`/events/${id}`, {method: 'PATCH', body: JSON.stringify(data)});
  }

  async deleteEvent(id: string) {
    return this.request(`/events/${id}`, {method: 'DELETE'});
  }

  // Tasks
  async getTasks(params: {completada?: boolean; panel_id?: string; prioridad?: number; vencidas?: boolean; limit?: number; offset?: number} = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && search.append(k, String(v)));
    return this.request<Array<any>>(`/tasks?${search.toString()}`);
  }

  async createTask(data: any) {
    return this.request<any>('/tasks', {method: 'POST', body: JSON.stringify(data)});
  }

  async updateTask(id: string, data: any) {
    return this.request<any>(`/tasks/${id}`, {method: 'PATCH', body: JSON.stringify(data)});
  }

  async deleteTask(id: string) {
    return this.request(`/tasks/${id}`, {method: 'DELETE'});
  }

  async bulkUpdateTasks(updates: Array<any>) {
    return this.request<Array<any>>('/tasks/bulk-update', {method: 'POST', body: JSON.stringify(updates)});
  }

  // Panels
  async getPanels(includeShared = true) {
    return this.request<Array<any>>(`/panels?include_shared=${includeShared}`);
  }

  async getPanel(id: string) {
    return this.request<any>(`/panels/${id}`);
  }

  async createPanel(data: any) {
    return this.request<any>('/panels', {method: 'POST', body: JSON.stringify(data)});
  }

  async updatePanel(id: string, data: any) {
    return this.request<any>(`/panels/${id}`, {method: 'PATCH', body: JSON.stringify(data)});
  }

  async deletePanel(id: string) {
    return this.request(`/panels/${id}`, {method: 'DELETE'});
  }

  async togglePublicPanel(id: string) {
    return this.request<any>(`/panels/${id}/toggle-public`, {method: 'POST'});
  }

  async addPanelPermission(panelId: string, usuarioId: string, rol: string) {
    return this.request<any>(`/panels/${panelId}/permissions`, {method: 'POST', body: JSON.stringify({usuario_id: usuarioId, rol})});
  }

  async removePanelPermission(panelId: string, usuarioId: string) {
    return this.request(`/panels/${panelId}/permissions/${usuarioId}`, {method: 'DELETE'});
  }

  // Backups
  async createBackup(includeChats = true) {
    return this.request<any>('/backups', {method: 'POST', body: JSON.stringify({include_chats: includeChats})});
  }

  async listBackups() {
    return this.request<Array<any>>('/backups');
  }

  async restoreBackup(filename: string, overwrite = false) {
    return this.request<any>('/backups/restore', {method: 'POST', body: JSON.stringify({backup_filename: filename, overwrite})});
  }

  async deleteBackup(filename: string) {
    return this.request(`/backups/${filename}`, {method: 'DELETE'});
  }

  async downloadBackup(filename: string) {
    return this.request<{download_url: string; expires_in: number}>(`/backups/${filename}/download`);
  }

  // Accounts / Profile
  async getProfile() {
    return this.request<any>('/accounts/me');
  }

  async updateProfile(data: any) {
    return this.request<any>('/accounts/me', {method: 'PATCH', body: JSON.stringify(data)});
  }

  async getAIProviders() {
    return this.request<any>('/accounts/providers');
  }

  async testAIKey(provider: string, apiKey: string) {
    return this.request<any>('/accounts/test-key', {method: 'POST', body: JSON.stringify({provider, api_key: apiKey})});
  }
}

export const api = new ApiClient(API_BASE);