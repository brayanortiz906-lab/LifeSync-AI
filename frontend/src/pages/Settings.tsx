import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Brain, Bell, Palette, Key, Loader2, Save, CheckCircle, AlertCircle, 
  Eye, EyeOff, Trash2, Plus, TestTube2, Shield, Moon, Sun, Monitor
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/lib/api';
import './Settings.css';

const tabs = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'ai', label: 'IA (BYOK)', icon: Brain },
  { id: 'notifications', label: 'Notificaciones', icon: Bell },
  { id: 'appearance', label: 'Apariencia', icon: Palette },
  { id: 'security', label: 'Seguridad', icon: Shield },
];

export function Settings() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error'; text: string} | null>(null);
  
  // Profile
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [locale, setLocale] = useState('es');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [dailySummaryTime, setDailySummaryTime] = useState('');
  
  // AI
  const [aiProvider, setAiProvider] = useState('');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [providers, setProviders] = useState<Array<{id: string; name: string; models: string[]; url: string}>>([]);
  
  // Notifications
  const [pushEnabled, setPushEnabled] = useState(false);
  
  // Appearance
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  
  // Security
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Cargar datos iniciales
  useEffect(() => {
    loadProfile();
    loadProviders();
  }, []);

  const loadProfile = async () => {
    try {
      const profile = await api.getProfile();
      setDisplayName(profile.display_name || '');
      setTimezone(profile.timezone || 'UTC');
      setLocale(profile.locale || 'es');
      setEmailNotifications(profile.email_notifications ?? true);
      setDailySummaryTime(profile.daily_summary_time || '');
      setAiProvider(profile.default_ai_provider || '');
      
      // API keys (solo nombres, no valores)
      const keys: Record<string, string> = {};
      Object.keys(profile.ai_api_keys || {}).forEach(k => {
        keys[k] = '';
      });
      setApiKeys(keys);
    } catch (e: any) {
      showMessage('error', e.message || 'Error cargando perfil');
    }
  };

  const loadProviders = async () => {
    try {
      const data = await api.getAIProviders();
      setProviders(data.providers);
    } catch (e) {
      console.error('Error cargando proveedores:', e);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.updateProfile({
        display_name: displayName || undefined,
        timezone,
        locale,
        email_notifications: emailNotifications,
        daily_summary_time: dailySummaryTime || undefined,
        default_ai_provider: aiProvider || undefined,
      });
      showMessage('success', 'Perfil guardado');
    } catch (e: any) {
      showMessage('error', e.message || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAI = async () => {
    setSaving(true);
    try {
      await api.updateProfile({
        default_ai_provider: aiProvider || undefined,
        ai_api_keys: Object.keys(apiKeys).length > 0 ? apiKeys : undefined,
      });
      showMessage('success', 'Configuración IA guardada');
    } catch (e: any) {
      showMessage('error', e.message || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const handleTestKey = async (provider: string, key: string) => {
    setTestingKey(provider);
    try {
      const result = await api.testAIKey(provider, key);
      if (result.valid) {
        showMessage('success', `Key válida para ${provider}`);
      } else {
        showMessage('error', result.message || 'Key inválida');
      }
    } catch (e: any) {
      showMessage('error', e.message || 'Error probando key');
    } finally {
      setTestingKey(null);
    }
  };

  const handleAddKey = (provider: string) => {
    const key = prompt(`Ingresa tu API key para ${provider}:`);
    if (key) {
      setApiKeys(prev => ({ ...prev, [provider]: key }));
      setShowKeys(prev => ({ ...prev, [provider]: true }));
    }
  };

  const handleRemoveKey = (provider: string) => {
    if (confirm(`¿Eliminar API key de ${provider}?`)) {
      setApiKeys(prev => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
      setShowKeys(prev => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      showMessage('error', 'Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 8) {
      showMessage('error', 'La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }

    setSaving(true);
    try {
      // Primero verificar contraseña actual haciendo login
      const { signIn } = useAuthStore.getState();
      await signIn(user?.email || '', currentPassword);
      // Luego actualizar
      await api.updateProfile({}); // Trigger para refresh
      // Nota: updatePassword está en auth store
      const { updatePassword: updatePwd } = useAuthStore.getState();
      await updatePwd(newPassword);
      showMessage('success', 'Contraseña actualizada');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (e: any) {
      showMessage('error', e.message || 'Error cambiando contraseña');
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | 'system' || 'system';
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const applyTheme = (t: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;
    if (t === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else {
      root.classList.toggle('dark', t === 'dark');
    }
  };

  const handleAccentChange = (color: string) => {
    setAccentColor(color);
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-hover', adjustColor(color, -20));
    document.documentElement.style.setProperty('--accent-light', `${color}26`);
    localStorage.setItem('accentColor', color);
  };

  useEffect(() => {
    const saved = localStorage.getItem('accentColor') || '#3b82f6';
    setAccentColor(saved);
    handleAccentChange(saved);
  }, []);

  // Render tab content
  const renderTab = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="settings-section">
            <h2>Perfil</h2>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="displayName">Nombre</label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="disabled"
                />
              </div>
              <div className="form-group">
                <label htmlFor="timezone">Zona horaria</label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  <option value="UTC">UTC</option>
                  <option value="America/Mexico_City">México (CDMX)</option>
                  <option value="America/Bogota">Colombia (Bogotá)</option>
                  <option value="America/Lima">Perú (Lima)</option>
                  <option value="America/Santiago">Chile (Santiago)</option>
                  <option value="America/Argentina/Buenos_Aires">Argentina (Buenos Aires)</option>
                  <option value="Europe/Madrid">España (Madrid)</option>
                  <option value="America/New_York">US Este (NY)</option>
                  <option value="America/Los_Angeles">US Oeste (LA)</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="locale">Idioma</label>
                <select
                  id="locale"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="dailySummaryTime">Resumen diario (HH:MM)</label>
                <input
                  id="dailySummaryTime"
                  type="time"
                  value={dailySummaryTime}
                  onChange={(e) => setDailySummaryTime(e.target.value)}
                />
              </div>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                  />
                  <span>Notificaciones por email</span>
                </label>
              </div>
            </div>
            <button onClick={handleSaveProfile} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={18} className="spin" /> : <> <Save size={18} /> Guardar cambios</>}
            </button>
          </div>
        );
      
      case 'ai':
        return (
          <div className="settings-section">
            <div className="section-header">
              <h2>Inteligencia Artificial (BYOK)</h2>
              <p className="section-desc">Trae tu propia clave (Bring Your Own Key). Las claves se encriptan en el servidor y solo tú las usas.</p>
            </div>
            
            <div className="form-group">
              <label>Proveedor por defecto</label>
              <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}>
                <option value="">Seleccionar...</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <h3>API Keys</h3>
            {providers.map(provider => (
              <div key={provider.id} className="provider-card">
                <div className="provider-info">
                  <div className="provider-header">
                    <strong>{provider.name}</strong>
                    <a href={provider.url} target="_blank" rel="noopener noreferrer" className="provider-link">
                      Obtener key →
                    </a>
                  </div>
                  <p className="provider-models">Modelos: {provider.models.join(', ')}</p>
                </div>
                <div className="provider-actions">
                  {apiKeys[provider.id] ? (
                    <div className="key-display">
                      <input
                        type={showKeys[provider.id] ? 'text' : 'password'}
                        value={apiKeys[provider.id] || '••••••••'}
                        readOnly
                      />
                      <button
                        onClick={() => setShowKeys(p => ({...p, [provider.id]: !p[provider.id]}))}
                        className="btn-icon"
                      >
                        {showKeys[provider.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        onClick={() => handleTestKey(provider.id, apiKeys[provider.id] || '')}
                        disabled={testingKey === provider.id || !apiKeys[provider.id]}
                        className="btn-icon"
                      >
                        {testingKey === provider.id ? <Loader2 size={16} className="spin" /> : <TestTube2 size={16} />}
                      </button>
                      <button
                        onClick={() => handleRemoveKey(provider.id)}
                        className="btn-icon danger"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => handleAddKey(provider.id)} className="btn-secondary">
                      <Plus size={16} /> Añadir key
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button onClick={handleSaveAI} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={18} className="spin" /> : <> <Save size={18} /> Guardar configuración IA</>}
            </button>
          </div>
        );
      
      case 'notifications':
        return (
          <div className="settings-section">
            <h2>Notificaciones</h2>
            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                />
                <span>Notificaciones por email</span>
              </label>
            </div>
            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={(e) => setPushEnabled(e.target.checked)}
                  disabled
                />
                <span>Notificaciones push (próximamente)</span>
              </label>
            </div>
            <div className="form-group">
              <label htmlFor="dailySummaryTime">Hora del resumen diario</label>
              <input
                id="dailySummaryTime"
                type="time"
                value={dailySummaryTime}
                onChange={(e) => setDailySummaryTime(e.target.value)}
              />
            </div>
          </div>
        );
      
      case 'appearance':
        return (
          <div className="settings-section">
            <h2>Apariencia</h2>
            
            <div className="form-group">
              <label>Tema</label>
              <div className="theme-options">
                {(['light', 'dark', 'system'] as const).map(t => (
                  <button
                    key={t}
                    className={`theme-option ${theme === t ? 'active' : ''}`}
                    onClick={() => handleThemeChange(t)}
                  >
                    <span className="theme-icon">
                      {t === 'light' && <Sun size={24} />}
                      {t === 'dark' && <Moon size={24} />}
                      {t === 'system' && <Monitor size={24} />}
                    </span>
                    <span>{t === 'light' ? 'Claro' : t === 'dark' ? 'Oscuro' : 'Sistema'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Color de acento</label>
              <div className="accent-colors">
                {['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#6366f1'].map(c => (
                  <button
                    key={c}
                    className={`accent-color ${accentColor === c ? 'active' : ''}`}
                    style={{background: c}}
                    onClick={() => handleAccentChange(c)}
                    aria-label={c}
                  />
                ))}
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => handleAccentChange(e.target.value)}
                  className="custom-color"
                  aria-label="Color personalizado"
                />
              </div>
            </div>
          </div>
        );
      
      case 'security':
        return (
          <div className="settings-section">
            <h2>Seguridad</h2>
            
            <div className="form-grid">
              <div className="form-group">
                <label>Contraseña actual</label>
                <div className="input-wrapper">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Contraseña actual"
                  />
                  <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="toggle-password">
                    {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Nueva contraseña</label>
                <div className="input-wrapper">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    minLength={8}
                  />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="toggle-password">
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirmar nueva contraseña</label>
                <div className="input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repetir contraseña"
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="toggle-password">
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
            <button onClick={handleChangePassword} disabled={saving || !currentPassword || !newPassword} className="btn-primary">
              {saving ? <Loader2 size={18} className="spin" /> : <> <Key size={18} /> Cambiar contraseña</>}
            </button>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="settings-page">
      {message && (
        <div className={`toast ${message.type}`}>
          <span>{message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}</span>
          <span>{message.text}</span>
        </div>
      )}

      <div className="settings-header">
        <h1>Ajustes</h1>
        <p>Configura tu cuenta, IA, notificaciones y más</p>
      </div>

      <div className="settings-layout">
        <aside className="settings-sidebar">
          <nav>
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon size={20} />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="settings-content">
          {renderTab()}
        </main>
      </div>
    </div>
  );
}

function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}