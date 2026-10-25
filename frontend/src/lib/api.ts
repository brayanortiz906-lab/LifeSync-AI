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
  tokens_entrada?: number;
  tokens_salida?: number;
  modelo?: string;
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

  // Public getters for components that need direct fetch access
  getBaseURL(): string {
    return this.baseURL;
  }

  getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
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
  async get<T>(endpoint: string, options?: { params?: Record<string, string | number> }): Promise<T> {
    let url = endpoint;
    if (options?.params) {
      const params = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        params.append(key, String(value));
      });
      url += `?${params.toString()}`;
    }
    return this.request<T>(url, { method: 'GET' });
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

  async inventario(): Promise<any> {
    return this.get('/responsabilidad/inventario');
  }

  async redactar(data: any): Promise<any> {
    return this.post('/responsabilidad/redactar', data);
  }

  async aprobaciones(estado?: string): Promise<any> {
    const query = estado ? `?estado=${estado}` : '';
    return this.get(`/responsabilidad/aprobaciones${query}`);
  }

  async decidirAprobacion(id: string, aprobar: boolean, nota?: string): Promise<any> {
    return this.post(`/responsabilidad/aprobaciones/${id}`, { decision: aprobar ? 'aprobar' : 'rechazar', nota });
  }

  async auditoria(params?: any): Promise<any> {
    return this.get('/responsabilidad/auditoria');
  }

  async resumenAuditoria(): Promise<any> {
    return this.get('/responsabilidad/auditoria/resumen');
  }

  async cumplimiento(): Promise<any> {
    return this.get('/responsabilidad/cumplimiento');
  }

  async purgarAuditoria(dias?: number): Promise<any> {
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

  // --- Legacy methods for useLifeAgente store compatibility ---
  async inicio(): Promise<any> {
    return this.get('/inicio');
  }

  async historial(): Promise<any> {
    return this.get('/chat');
  }

  async chat(mensaje: string, options?: { proveedor?: string; modelo?: string; api_key?: string }): Promise<any> {
    return this.post('/chat', { contenido: mensaje, proveedor: options?.proveedor, modelo: options?.modelo, api_key: options?.api_key });
  }

  async eventos(desde?: string, hasta?: string): Promise<any> {
    const params = new URLSearchParams();
    if (desde) params.append('desde', desde);
    if (hasta) params.append('hasta', hasta);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/events${query}`);
  }

  async dashboard(): Promise<any> {
    return this.get('/inicio');
  }

  async completarTarea(id: string): Promise<any> {
    return this.patch(`/tasks/${id}`, { completada: true });
  }

  async tareas(): Promise<any> {
    return this.get('/tasks');
  }

  async crearRegistro(data: any): Promise<any> {
    return this.post('/responsabilidad/auditoria', data);
  }

  async registros(): Promise<any> {
    return this.get('/responsabilidad/auditoria');
  }

  async completarMantenimiento(id: string): Promise<any> {
    return this.patch(`/responsabilidad/mantenimiento/${id}`, { completado: true });
  }

  async mantenimiento(): Promise<any> {
    return this.get('/responsabilidad/mantenimiento');
  }

  async eliminarEvento(id: string): Promise<any> {
    return this.delete(`/events/${id}`);
  }

  async limpiarHistorial(): Promise<any> {
    return this.delete('/chat');
  }

  async guardarAjustes(data: any): Promise<any> {
    return this.patch('/accounts/me', data);
  }

  async politica(): Promise<any> {
    return this.get('/responsabilidad/politica');
  }

  async guardarPolitica(data: any): Promise<any> {
    return this.patch('/responsabilidad/politica', data);
  }

  async ingerir(data: any): Promise<any> {
    return this.post('/ingest', data);
  }

  // Local storage helpers
  guardarToken(token: string) { this.setToken(token); }
  borrarToken() { this.setToken(null); }
  guardarUrlApi(url: string) { localStorage.setItem('api_url', url); }
  leerUrlApi(): string { return localStorage.getItem('api_url') || API_BASE; }
  apiGuardadaEsEstatica(): boolean { return false; }
  urlApiEnUso(): string { return this.baseURL; }
  guardarApiKeyLocal(key: string) { localStorage.setItem('ai_api_key', key); }
  leerApiKeyLocal(): string | null { return localStorage.getItem('ai_api_key'); }
  ingresar(data: any): Promise<any> { return this.post('/ingest', data); }
  ingest(data: any): Promise<any> { return this.post('/ingest', data); }
  health(): Promise<any> { return this.get('/health'); }
  sincronizar(): Promise<any> { return this.post('/sync'); }

  // Property getters for legacy component compatibility
  get cuentas() {
    return {
      yo: () => this.getAccountYo(),
      getYo: () => this.getAccountYo(),
      iniciar: (email: string) => this.iniciarCuenta(email),
      terminar: (email: string, codigo: string) => this.terminarCuenta(email, codigo),
      google: (data: any) => this.post('/cuentas/google', data),
      salir: () => this.salir(),
      respaldo: () => this.get('/cuentas/respaldo'),
      respaldoDrive: () => this.post('/cuentas/respaldo/drive'),
      restaurar: (data: any) => this.post('/cuentas/respaldo/restaurar', data),
      googleDisponible: () => this.get<{disponible: boolean}>('/cuentas/google/disponible'),
      proveedores: () => this.get<{proveedores: any[]}>('/cuentas/proveedores'),
      iniciarAccesoGoogle: (proveedor: string) => this.post('/cuentas/google/iniciar', { proveedor }),
      terminarAccesoGoogle: (device_code: string, proveedor: string) => this.post('/cuentas/google/terminar', { device_code, proveedor }),
      googleDesdeIdToken: (credential: string) => this.post('/cuentas/google/token', { credential }),
      pedirCodigo: (email: string) => this.post('/cuentas/codigo', { email }),
      registrar: (data: any) => this.post('/cuentas/registrar', data),
      reenviarCodigo: (email: string) => this.post('/cuentas/reenviar-codigo', { email }),
      entrar: (data: any) => this.post('/cuentas/entrar', data),
      entrarOCrear: (data: any) => this.post('/cuentas/entrar-o-crear', data),
      verificarCodigo: (email: string, codigo: string) => this.post('/cuentas/verificar', { email, codigo }),
      respaldoDriveDesdeConexion: () => this.post('/cuentas/respaldo/drive-desde-conexion'),
      clientesServidor: () => this.get('/cuentas/clientes-servidor'),
      probarClienteServidor: (id: string) => this.post(`/cuentas/clientes-servidor/${id}/probar`),
      guardarClientesServidor: (data: any) => this.post('/cuentas/clientes-servidor', data),
      smtp: () => this.get('/cuentas/smtp'),
      guardarSmtp: (data: any) => this.post('/cuentas/smtp', data),
      probarSmtp: () => this.post('/cuentas/smtp/probar'),
      sincronizar: () => this.sincronizar(),
    };
  }

  get permisos() {
    return {
      get: () => this.getPermisos(),
      estado: () => this.getPermisos(),
      autorizar: () => this.post('/permisos/autorizar'),
      terminar: () => this.post('/permisos/terminar'),
      autopiloto: (enabled: boolean) => this.post('/permisos/autopiloto', { enabled }),
      ejecutarAutopiloto: () => this.post('/permisos/autopiloto/ejecutar'),
      respaldo: () => this.post('/permisos/respaldo'),
      importarCalendario: () => this.post('/permisos/importar-calendario'),
      guardar: (data: any) => this.post('/permisos/guardar', data),
      correoResumen: (data: any) => this.post('/permisos/correo-resumen', data),
      ejecutar: () => this.post('/permisos/ejecutar'),
      respaldar: () => this.post('/permisos/respaldar'),
      respaldoCorreo: (data: any) => this.post('/permisos/respaldo-correo', data),
      restaurarDrive: () => this.post('/permisos/restaurar-drive'),
    };
  }

  get paneles() {
    return {
      get: () => this.getPanels(),
      lista: () => this.getPanels(),
      crear: (data: any) => this.createPanel(data),
      actualizar: (id: string, data: any) => this.patch(`/panels/${id}`, data),
      eliminar: (id: string) => this.deletePanel(id),
      borrar: (id: string) => this.deletePanel(id),
      miembros: (id: string) => this.get(`/panels/${id}/miembros`),
      compartir: (id: string, data: any) => this.post(`/panels/${id}/compartir`, data),
      quitarAcceso: (id: string, usuarioId: string) => this.delete(`/panels/${id}/compartir/${usuarioId}`),
      datos: (id: string) => this.get(`/panels/${id}/datos`),
    };
  }

  get conexiones() {
    return {
      get: () => this.getConexiones(),
      catalogo: () => this.catalogoConexiones(),
      detectarLocales: () => this.detectarLocales(),
      estadoGoogle: () => this.estadoGoogle(),
      diagnostico: () => this.diagnostico(),
      iaGratis: () => this.iaGratis(),
      agentesLocales: () => this.agentesLocales(),
      modelosDisponibles: () => this.modelosDisponibles(),
      crear: (data: any) => this.guardarConexion(data),
      verificar: (id: string) => this.verificarConexion(id),
      eliminar: (id: string) => this.eliminarConexion(id),
      probarUrl: (url: string) => this.probarUrl(url),
      getAIProviders: () => this.getAIProviders(),
      testAIKey: (provider: string, key: string) => this.testAIKey(provider, key),
      clientesServidor: () => this.get('/conexiones/clientes-servidor'),
      probarClienteServidor: (id: string) => this.post(`/conexiones/clientes-servidor/${id}/probar`),
      guardarClientesServidor: (data: any) => this.post('/conexiones/clientes-servidor', data),
      smtp: () => this.get('/conexiones/smtp'),
      guardarSmtp: (data: any) => this.post('/conexiones/smtp', data),
      probarSmtp: () => this.post('/conexiones/smtp/probar'),
    };
  }

  get chatApi() {
    return {
      getChats: () => this.getChats(),
      createChat: (data: any) => this.createChat(data),
      getChat: (id: string) => this.getChat(id),
      updateChat: (id: string, data: any) => this.updateChat(id, data),
      deleteChat: (id: string) => this.deleteChat(id),
      sendMessage: (id: string, contenido: string) => this.sendMessage(id, contenido),
      sendMessageStream: (id: string, mensaje: string, onChunk: (text: string) => void) => this.sendMessageStream(id, mensaje, onChunk),
    };
  }
}

export const api = new ApiClient(API_BASE);

// Data / GDPR endpoints
export async function deleteMyData(): Promise<{ message: string; details: any }> {
  return api.delete<{ message: string; details: any }>('/data/delete');
}

export async function exportMyData(): Promise<Blob> {
  const url = `${api.getBaseURL()}/data/export`;
  const response = await fetch(url, {
    method: 'GET',
    headers: api.getHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Error exportando datos: ${response.statusText}`);
  }
  return response.blob();
}

export async function getDataSummary(): Promise<any> {
  return api.get<any>('/data/summary');
}

// Parental Consent (COPPA) endpoints
export async function sendParentalVerification(parentEmail: string, childUserId: string): Promise<{ message: string }> {
  return api.post<{ message: string }>('/parental/send-verification', { parent_email: parentEmail, child_user_id: childUserId });
}

export async function verifyParentalCode(parentEmail: string, code: string): Promise<{ message: string; child_user_id: string; parent_email: string }> {
  return api.post<{ message: string; child_user_id: string; parent_email: string }>('/parental/verify-code', { parent_email: parentEmail, code });
}

// Named exports for legacy components that import individual functions
export const cuentas = {
  yo: () => api.getAccountYo(),
  getYo: () => api.getAccountYo(),
  iniciar: (email: string) => api.iniciarCuenta(email),
  terminar: (email: string, codigo: string) => api.terminarCuenta(email, codigo),
  google: (data: any) => api.post('/cuentas/google', data),
  salir: () => api.salir(),
  respaldo: () => api.get('/cuentas/respaldo'),
  respaldoDrive: () => api.post('/cuentas/respaldo/drive'),
  restaurar: (data: any) => api.post('/cuentas/respaldo/restaurar', data),
  googleDisponible: () => api.get<{disponible: boolean}>('/cuentas/google/disponible'),
  proveedores: () => api.get<{proveedores: any[]}>('/cuentas/proveedores'),
  iniciarAccesoGoogle: (proveedor: string) => api.post('/cuentas/google/iniciar', { proveedor }),
  terminarAccesoGoogle: (device_code: string, proveedor: string) => api.post('/cuentas/google/terminar', { device_code, proveedor }),
  googleDesdeIdToken: (credential: string) => api.post('/cuentas/google/token', { credential }),
  pedirCodigo: (email: string) => api.post('/cuentas/codigo', { email }),
  registrar: (data: any) => api.post('/cuentas/registrar', data),
  reenviarCodigo: (email: string) => api.post('/cuentas/reenviar-codigo', { email }),
  entrar: (data: any) => api.post('/cuentas/entrar', data),
  entrarOCrear: (data: any) => api.post('/cuentas/entrar-o-crear', data),
  verificarCodigo: (email: string, codigo: string) => api.post('/cuentas/verificar', { email, codigo }),
  respaldoDriveDesdeConexion: () => api.post('/cuentas/respaldo/drive-desde-conexion'),
  clientesServidor: () => api.get('/cuentas/clientes-servidor'),
  probarClienteServidor: (id: string) => api.post(`/cuentas/clientes-servidor/${id}/probar`),
  guardarClientesServidor: (data: any) => api.post('/cuentas/clientes-servidor', data),
  smtp: () => api.get('/cuentas/smtp'),
  guardarSmtp: (data: any) => api.post('/cuentas/smtp', data),
  probarSmtp: () => api.post('/cuentas/smtp/probar'),
  sincronizar: () => api.sincronizar(),
};

export const permisos = {
  get: () => api.getPermisos(),
  estado: () => api.getPermisos(),
  autorizar: () => api.post('/permisos/autorizar'),
  terminar: () => api.post('/permisos/terminar'),
  autopiloto: (enabled: boolean) => api.post('/permisos/autopiloto', { enabled }),
  ejecutarAutopiloto: () => api.post('/permisos/autopiloto/ejecutar'),
  respaldo: () => api.post('/permisos/respaldo'),
  importarCalendario: () => api.post('/permisos/importar-calendario'),
  guardar: (data: any) => api.post('/permisos/guardar', data),
  correoResumen: (data: any) => api.post('/permisos/correo-resumen', data),
  ejecutar: () => api.post('/permisos/ejecutar'),
  respaldar: () => api.post('/permisos/respaldar'),
  respaldoCorreo: (data: any) => api.post('/permisos/respaldo-correo', data),
  restaurarDrive: () => api.post('/permisos/restaurar-drive'),
};

export const paneles = {
  get: () => api.getPanels(),
  lista: () => api.getPanels(),
  crear: (data: any) => api.createPanel(data),
  actualizar: (id: string, data: any) => api.patch(`/panels/${id}`, data),
  eliminar: (id: string) => api.deletePanel(id),
  borrar: (id: string) => api.deletePanel(id),
  miembros: (id: string) => api.get(`/panels/${id}/miembros`),
  compartir: (id: string, data: any) => api.post(`/panels/${id}/compartir`, data),
  quitarAcceso: (id: string, usuarioId: string) => api.delete(`/panels/${id}/compartir/${usuarioId}`),
  datos: (id: string) => api.get(`/panels/${id}/datos`),
};

export const conexiones = {
  get: () => api.getConexiones(),
  catalogo: () => api.catalogoConexiones(),
  detectarLocales: () => api.detectarLocales(),
  estadoGoogle: () => api.estadoGoogle(),
  diagnostico: () => api.diagnostico(),
  iaGratis: () => api.iaGratis(),
  agentesLocales: () => api.agentesLocales(),
  modelosDisponibles: () => api.modelosDisponibles(),
  crear: (data: any) => api.guardarConexion(data),
  verificar: (id: string) => api.verificarConexion(id),
  eliminar: (id: string) => api.eliminarConexion(id),
  probarUrl: (url: string) => api.probarUrl(url),
  getAIProviders: () => api.getAIProviders(),
  testAIKey: (provider: string, key: string) => api.testAIKey(provider, key),
  clientesServidor: () => api.get('/conexiones/clientes-servidor'),
  probarClienteServidor: (id: string) => api.post(`/conexiones/clientes-servidor/${id}/probar`),
  guardarClientesServidor: (data: any) => api.post('/conexiones/clientes-servidor', data),
  smtp: () => api.get('/conexiones/smtp'),
  guardarSmtp: (data: any) => api.post('/conexiones/smtp', data),
  probarSmtp: () => api.post('/conexiones/smtp/probar'),
};

export function guardarToken(token: string) { api.guardarToken(token); }
export function borrarToken() { api.borrarToken(); }
export function guardarUrlApi(url: string) { api.guardarUrlApi(url); }
export function leerUrlApi(): string { return api.leerUrlApi(); }
export function apiGuardadaEsEstatica(): boolean { return api.apiGuardadaEsEstatica(); }
export function urlApiEnUso(): string { return api.urlApiEnUso(); }
export function guardarApiKeyLocal(key: string) { api.guardarApiKeyLocal(key); }
export function leerApiKeyLocal(): string | null { return api.leerApiKeyLocal(); }
export function ingerir(data: any): Promise<any> { return api.ingresar(data); }
export function health(): Promise<any> { return api.health(); }
export function sincronizar(): Promise<any> { return api.sincronizar(); }
export const get = <T,>(endpoint: string) => api.get<T>(endpoint);
export const post = <T,>(endpoint: string, data?: any) => api.post<T>(endpoint, data);
export const patch = <T,>(endpoint: string, data?: any) => api.patch<T>(endpoint, data);
export const del = <T,>(endpoint: string) => api.delete<T>(endpoint);
export const chatApi = {
  getChats: () => api.getChats(),
  createChat: (data: any) => api.createChat(data),
  getChat: (id: string) => api.getChat(id),
  updateChat: (id: string, data: any) => api.updateChat(id, data),
  deleteChat: (id: string) => api.deleteChat(id),
  sendMessage: (id: string, contenido: string) => api.sendMessage(id, contenido),
  sendMessageStream: (id: string, mensaje: string, onChunk: (text: string) => void) => api.sendMessageStream(id, mensaje, onChunk),
};
export function inicio() { return api.inicio(); }
export function historial() { return api.historial(); }
export function limpiarHistorial() { return api.limpiarHistorial(); }
export function guardarAjustes(data: any) { return api.guardarAjustes(data); }
export function tareas() { return api.tareas(); }
export function completarTarea(id: string) { return api.completarTarea(id); }
export function eventos(desde?: string, hasta?: string) { return api.eventos(desde, hasta); }
export function dashboard() { return api.dashboard(); }
export function registros() { return api.registros(); }
export function crearRegistro(data: any) { return api.crearRegistro(data); }
export function mantenimiento() { return api.mantenimiento(); }
export function completarMantenimiento(id: string) { return api.completarMantenimiento(id); }
export function eliminarEvento(id: string) { return api.eliminarEvento(id); }
export function politica() { return api.politica(); }
export function aprobaciones(estado?: string) { return api.aprobaciones(estado); }
export function auditoria(params?: any) { return api.auditoria(params); }
export function resumenAuditoria() { return api.resumenAuditoria(); }
export function cumplimiento() { return api.cumplimiento(); }
export function guardarPolitica(data: any) { return api.guardarPolitica(data); }
export function decidirAprobacion(id: string, aprobar: boolean, nota?: string) { return api.decidirAprobacion(id, aprobar, nota); }
export function purgarAuditoria(dias?: number) { return api.purgarAuditoria(dias); }