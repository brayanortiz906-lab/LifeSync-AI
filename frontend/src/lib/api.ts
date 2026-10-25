// API Client para backend FastAPI v2.x (Completo)
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export interface Profile {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  timezone?: string;
  locale?: string;
  email_notifications?: boolean;
  daily_summary_time?: string;
  default_ai_provider?: string;
  ai_api_keys?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  titulo?: string;
  modelo: string;
  system_prompt?: string;
  creado_at: string;
  actualizado_at: string;
  mensajes?: Message[];
}

export interface Message {
  id: string;
  chat_id: string;
  rol: 'user' | 'assistant' | 'system' | 'function';
  contenido: string;
  tool_calls?: any;
  tool_results?: any;
  tokens?: number;
  creado_at: string;
}

export type MensajeChat = Message;

export interface TaskItem {
  id: string;
  titulo: string;
  descripcion?: string;
  completada: boolean;
  prioridad: 'baja' | 'media' | 'alta' | 'urgente';
  fecha_limite?: string;
  categoria?: string;
}

export interface EventItem {
  id: string;
  titulo: string;
  categoria: string;
  inicio: string;
  fin: string;
  inamovible: boolean;
  notas?: string;
  fuente: string;
}

export interface PanelItem {
  id: string;
  nombre: string;
  descripcion?: string;
  color: string;
  icono?: string;
  es_publico: boolean;
  creado_at: string;
}

export interface ConexionIAItem {
  id: string;
  proveedor: string;
  nombre: string;
  activo: boolean;
  modelo_defecto?: string;
}

class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
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

  getToken(): string | null {
    return this.token;
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
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      let errorDetail = response.statusText;
      try {
        const errJson = await response.json();
        errorDetail = errJson.detail || JSON.stringify(errJson);
      } catch (e) {
        const errText = await response.text();
        if (errText) errorDetail = errText;
      }
      throw new Error(`API Error [${response.status}]: ${errorDetail}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // HTTP generic methods for compatibility with legacy components
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // --- Auth / Accounts ---
  async getProfile(): Promise<Profile> {
    return this.request<Profile>('/accounts/me');
  }

  async updateProfile(data: Partial<Profile>): Promise<Profile> {
    return this.request<Profile>('/accounts/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getAccountYo(): Promise<any> {
    return this.request<any>('/cuentas/yo');
  }

  async salir(): Promise<any> {
    return this.request<any>('/cuentas/salir', { method: 'POST' });
  }

  // --- Chat ---
  async getChats(skip = 0, limit = 50): Promise<Chat[]> {
    return this.request<Chat[]>(`/chat?skip=${skip}&limit=${limit}`);
  }

  async createChat(data: { titulo?: string; modelo?: string; system_prompt?: string }): Promise<Chat> {
    return this.request<Chat>('/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getChat(chatId: string): Promise<Chat> {
    return this.request<Chat>(`/chat/${chatId}`);
  }

  async updateChat(chatId: string, data: any): Promise<Chat> {
    return this.request<Chat>(`/chat/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteChat(chatId: string): Promise<void> {
    return this.request<void>(`/chat/${chatId}`, { method: 'DELETE' });
  }

  async sendMessage(chatId: string, contenido: string): Promise<any> {
    return this.request<any>(`/chat/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ contenido }),
    });
  }

  async sendMessageStream(chatId: string, mensaje: string, onChunk: (text: string) => void): Promise<void> {
    const url = `${this.baseURL}/chat/${chatId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ contenido: mensaje }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Error en stream de chat: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      onChunk(chunk);
    }
  }

  // --- Tasks ---
  async getTasks(): Promise<TaskItem[]> {
    return this.request<TaskItem[]>('/tasks');
  }

  async createTask(data: Partial<TaskItem>): Promise<TaskItem> {
    return this.request<TaskItem>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTask(id: string, data: Partial<TaskItem>): Promise<TaskItem> {
    return this.request<TaskItem>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTask(id: string): Promise<void> {
    return this.request<void>(`/tasks/${id}`, { method: 'DELETE' });
  }

  // --- Events ---
  async getEvents(): Promise<EventItem[]> {
    return this.request<EventItem[]>('/events');
  }

  async createEvent(data: Partial<EventItem>): Promise<EventItem> {
    return this.request<EventItem>('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteEvent(id: string): Promise<void> {
    return this.request<void>(`/events/${id}`, { method: 'DELETE' });
  }

  // --- Panels ---
  async getPanels(): Promise<PanelItem[]> {
    return this.request<PanelItem[]>('/panels');
  }

  async createPanel(data: Partial<PanelItem>): Promise<PanelItem> {
    return this.request<PanelItem>('/panels', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deletePanel(id: string): Promise<void> {
    return this.request<void>(`/panels/${id}`, { method: 'DELETE' });
  }

  // --- Conexiones & AI ---
  async getConexiones(): Promise<ConexionIAItem[]> {
    return this.request<ConexionIAItem[]>('/conexiones');
  }

  async createConexion(data: any): Promise<ConexionIAItem> {
    return this.request<ConexionIAItem>('/conexiones', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async guardarConexion(data: any): Promise<any> {
    return this.createConexion(data);
  }

  async eliminarConexion(id: string): Promise<any> {
    return this.delete(`/conexiones/${id}`);
  }

  async verificarConexion(id: string): Promise<any> {
    return this.post(`/conexiones/${id}/verificar`);
  }

  async probarUrl(url: string): Promise<any> {
    return this.post('/conexiones/probar-url', { url });
  }

  async catalogoConexiones(): Promise<any> {
    return this.get('/conexiones/catalogo');
  }

  async detectarLocales(): Promise<any> {
    return this.get('/conexiones/detectar-locales');
  }

  async estadoGoogle(): Promise<any> {
    return this.get('/conexiones/google/estado');
  }

  async diagnostico(): Promise<any> {
    return this.get('/conexiones/diagnostico');
  }

  async iaGratis(): Promise<any> {
    return this.get('/conexiones/ia-gratis');
  }

  async agentesLocales(): Promise<any> {
    return this.get('/conexiones/agentes-locales');
  }

  async modelosDisponibles(): Promise<any> {
    return this.get('/conexiones/modelos');
  }

  async getAIProviders(): Promise<any> {
    return this.catalogoConexiones();
  }

  async testAIKey(provider: string, key: string): Promise<any> {
    return this.post('/conexiones/test', { proveedor: provider, api_key: key });
  }

  // --- Cuentas / Auth Aliases ---
  async iniciarCuenta(email: string): Promise<any> {
    return this.post('/cuentas/codigo', { email });
  }

  async terminarCuenta(email: string, codigo: string): Promise<any> {
    return this.post('/cuentas/verificar', { email, codigo });
  }

  async guardarGoogleClientId(client_id: string): Promise<any> {
    return this.post('/cuentas/google/client-id', { client_id });
  }

  // --- Permisos & Responsabilidad ---
  async getPermisos(): Promise<any> {
    return this.get('/permisos');
  }

  async getPolitica(): Promise<any> {
    return this.get('/responsabilidad/politica');
  }

  async updatePolitica(data: any): Promise<any> {
    return this.patch('/responsabilidad/politica', data);
  }

  async guardarPolitica(data: any): Promise<any> {
    return this.updatePolitica(data);
  }

  async inventario(): Promise<any> {
    return this.get('/responsabilidad/inventario');
  }

  async redactar(data: any): Promise<any> {
    return this.post('/responsabilidad/redactar', data);
  }

  async aprobaciones(): Promise<any> {
    return this.get('/responsabilidad/aprobaciones');
  }

  async decidirAprobacion(id: string, decision: string): Promise<any> {
    return this.post(`/responsabilidad/aprobaciones/${id}`, { decision });
  }

  async auditoria(): Promise<any> {
    return this.get('/responsabilidad/auditoria');
  }

  async resumenAuditoria(): Promise<any> {
    return this.get('/responsabilidad/auditoria/resumen');
  }

  async cumplimiento(): Promise<any> {
    return this.get('/responsabilidad/cumplimiento');
  }

  async purgarAuditoria(): Promise<any> {
    return this.delete('/responsabilidad/auditoria');
  }

  // --- Backups ---
  async createBackup(): Promise<any> {
    return this.post('/backups');
  }

  async getBackups(): Promise<any[]> {
    return this.get('/backups');
  }

  // --- Inicio & Dashboard ---
  async getInicio(): Promise<any> {
    return this.get('/inicio');
  }

  async dashboard(): Promise<any> {
    return this.get('/inicio');
  }

  async historial(): Promise<any> {
    return this.get('/chat');
  }

  async limpiarHistorial(): Promise<any> {
    return this.delete('/chat');
  }

  async guardarAjustes(data: any): Promise<any> {
    return this.patch('/accounts/me', data);
  }

  async tareas(): Promise<any> {
    return this.get('/tasks');
  }

  async completarTarea(id: string): Promise<any> {
    return this.patch(`/tasks/${id}`, { completada: true });
  }

  async eventos(): Promise<any> {
    return this.get('/events');
  }

  async registros(): Promise<any> {
    return this.get('/responsabilidad/auditoria');
  }

  async crearRegistro(data: any): Promise<any> {
    return this.post('/responsabilidad/auditoria', data);
  }

  async mantenimiento(): Promise<any> {
    return this.get('/responsabilidad/mantenimiento');
  }

  async completarMantenimiento(id: string): Promise<any> {
    return this.patch(`/responsabilidad/mantenimiento/${id}`, { completado: true });
  }

  // Local storage helpers exported as methods for legacy component compatibility
  guardarToken(token: string) { this.setToken(token); }
  borrarToken() { this.setToken(null); }
  guardarUrlApi(url: string) { localStorage.setItem('api_url', url); }
  leerUrlApi(): string { return localStorage.getItem('api_url'] || API_BASE; }
  apiGuardadaEsEstatica(): boolean { return false; }
  urlApiEnUso(): string { return this.baseURL; }
  guardarApiKeyLocal(key: string) { localStorage.setItem('ai_api_key', key); }
  leerApiKeyLocal(): string | null { return localStorage.getItem('ai_api_key'); }
}

export const api = new ApiClient(API_BASE);
