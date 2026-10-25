import { useState, useEffect, useCallback } from 'react';
import { 
  Bell, BellRing, BellOff, Plus, Trash2, Edit, 
  Clock, Calendar, Repeat, Volume2, VolumeX, 
  CheckCircle, AlertCircle, Loader2, Save, X
} from 'lucide-react';
import { api } from '@/lib/api';
import { format, parseISO, isValid, addDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import './PanelAlarmas.css';

interface Alarma {
  id: string;
  titulo: string;
  fecha: string;        // YYYY-MM-DD
  hora: string;         // HH:MM
  repetir: 'ninguna' | 'diaria' | 'laborables' | 'semanal' | 'mensual' | 'anual';
  sonido: string;
  activa: boolean;
  creada_en: string;
}

interface AlarmaFormData {
  titulo: string;
  fecha: string;
  hora: string;
  repetir: Alarma['repetir'];
  sonido: string;
  activa?: boolean;
}

const SONIDOS = [
  { id: 'default', nombre: 'Predeterminado', url: '' },
  { id: 'suave', nombre: 'Suave', url: '/sounds/soft.mp3' },
  { id: 'alarma', nombre: 'Alarma clásica', url: '/sounds/alarm.mp3' },
  { id: 'notificacion', nombre: 'Notificación', url: '/sounds/notify.mp3' },
];

const REPETICIONES = [
  { id: 'ninguna', label: 'Solo una vez' },
  { id: 'diaria', label: 'Diaria' },
  { id: 'laborables', label: 'Lunes a viernes' },
  { id: 'semanal', label: 'Semanal' },
  { id: 'mensual', label: 'Mensual (mismo día)' },
  { id: 'anual', label: 'Anual (misma fecha)' },
];

export function PanelAlarmas() {
  const [alarmas, setAlarmas] = useState<Alarma[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<Alarma | null>(null);
  const [form, setForm] = useState<AlarmaFormData>({
    titulo: '',
    fecha: format(new Date(), 'yyyy-MM-dd'),
    hora: '08:00',
    repetir: 'ninguna',
    sonido: 'default',
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargarAlarmas = useCallback(async () => {
    setCargando(true);
    try {
      const data = await api.get<Alarma[]>('/alarmas');
      setAlarmas(data);
    } catch (e: any) {
      setError(e.message || 'Error cargando alarmas');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarAlarmas();
    // Verificar alarmas cada minuto
    const interval = setInterval(verificarAlarmas, 60000);
    return () => clearInterval(interval);
  }, [cargarAlarmas]);

  const verificarAlarmas = async () => {
    const ahora = new Date();
    const hoy = format(ahora, 'yyyy-MM-dd');
    const horaActual = format(ahora, 'HH:mm');

    for (const alarma of alarmas) {
      if (!alarma.activa) continue;
      if (alarma.fecha !== hoy && alarma.repetir === 'ninguna') continue;
      
      // Verificar días laborables
      if (alarma.repetir === 'laborables') {
        const dia = new Date(alarma.fecha).getDay();
        if (dia === 0 || dia === 6) continue; // Dom/Sab
      }
      
      if (alarma.hora === horaActual) {
        dispararAlarma(alarma);
      }
    }
  };

  const dispararAlarma = (alarma: Alarma) => {
    // Notificación nativa
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`⏰ ${alarma.titulo}`, {
        body: `Son las ${alarma.hora}`,
        icon: '/icon-192.png',
        tag: `alarma-${alarma.id}`,
        requireInteraction: true,
      });
    }

    // Sonido
    if (alarma.sonido !== 'default') {
      const audio = new Audio(`/sounds/${alarma.sonido}.mp3`);
      audio.loop = true;
      audio.play().catch(() => {});
      // Parar después de 30s
      setTimeout(() => { audio.pause(); audio.currentTime = 0; }, 30000);
    }

    // Vibración (mobile)
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }

    // Si es solo una vez, desactivar
    if (alarma.repetir === 'ninguna') {
      setAlarmas(prev => prev.map(a => 
        a.id === alarma.id ? { ...a, activa: false } : a
      ));
      actualizarEnBackend(alarma.id, { activa: false });
    }
  };

  const solicitarPermisoNotificaciones = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  useEffect(() => {
    solicitarPermisoNotificaciones();
  }, []);

  const abrirForm = (alarma?: Alarma) => {
    if (alarma) {
      setEditando(alarma);
      setForm({
        titulo: alarma.titulo,
        fecha: alarma.fecha,
        hora: alarma.hora,
        repetir: alarma.repetir,
        sonido: alarma.sonido,
      });
    } else {
      setEditando(null);
      setForm({
        titulo: '',
        fecha: format(new Date(), 'yyyy-MM-dd'),
        hora: '08:00',
        repetir: 'ninguna',
        sonido: 'default',
      });
    }
    setMostrarForm(true);
    setError(null);
  };

  const cerrarForm = () => {
    setMostrarForm(false);
    setEditando(null);
    setForm({
      titulo: '',
      fecha: format(new Date(), 'yyyy-MM-dd'),
      hora: '08:00',
      repetir: 'ninguna',
      sonido: 'default',
    });
  };

  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    try {
      if (editando) {
        await api.patch(`/alarmas/${editando.id}`, form);
      } else {
        await api.post('/alarmas', form);
      }
      cerrarForm();
      cargarAlarmas();
    } catch (e: any) {
      setError(e.message || 'Error guardando alarma');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta alarma?')) return;
    try {
      await api.delete(`/alarmas/${id}`);
      cargarAlarmas();
    } catch (e: any) {
      setError(e.message || 'Error eliminando');
    }
  };

  const toggleActiva = async (alarma: Alarma) => {
    try {
      await api.patch(`/alarmas/${alarma.id}`, { activa: !alarma.activa });
      cargarAlarmas();
    } catch (e: any) {
      setError(e.message || 'Error actualizando');
    }
  };

  const actualizarEnBackend = async (id: string, data: Partial<Alarma>) => {
    try {
      await api.patch(`/alarmas/${id}`, data);
    } catch (e) {
      console.error('Error actualizando backend:', e);
    }
  };

  const formatearRepetir = (rep: string) => {
    const r = REPETICIONES.find(x => x.id === rep);
    return r?.label || rep;
  };

  const formatearFecha = (fecha: string) => {
    try {
      return format(parseISO(fecha), 'EEEE d MMMM', { locale: es });
    } catch {
      return fecha;
    }
  };

  const esProxima = (alarma: Alarma) => {
    const ahora = new Date();
    const alarmaDate = new Date(`${alarma.fecha}T${alarma.hora}`);
    const diff = alarmaDate.getTime() - ahora.getTime();
    return diff > 0 && diff < 24 * 60 * 60 * 1000; // Próximas 24h
  };

  const esPasada = (alarma: Alarma) => {
    const ahora = new Date();
    const alarmaDate = new Date(`${alarma.fecha}T${alarma.hora}`);
    return alarmaDate < ahora && alarma.repetir === 'ninguna';
  };

  return (
    <div className="panel-alarmas">
      <div className="panel-header">
        <div className="header-left">
          <Bell size={24} className="icon" />
          <div>
            <h3>Alarmas y Recordatorios</h3>
            <p className="subtitle">{alarmas.filter(a => a.activa).length} activas · {alarmas.length} total</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => abrirForm()}>
          <Plus size={18} /> Nueva alarma
        </button>
      </div>

      {error && <div className="msg error"><AlertCircle size={18} /> {error}</div>}

      {/* Formulario */}
      {mostrarForm && (
        <div className="form-overlay" onClick={cerrarForm}>
          <div className="form-modal" onClick={e => e.stopPropagation()}>
            <div className="form-header">
              <h3>{editando ? 'Editar alarma' : 'Nueva alarma'}</h3>
              <button className="btn-close" onClick={cerrarForm}><X size={20} /></button>
            </div>
            <form onSubmit={manejarSubmit}>
              <div className="form-grid">
                <div className="form-group full">
                  <label>Título *</label>
                  <input
                    type="text"
                    value={form.titulo}
                    onChange={e => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Ej: Tomar medicación, Reunión, Llamar a..."
                    required
                    maxLength={100}
                  />
                </div>
                <div className="form-group">
                  <label>Fecha *</label>
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={e => setForm({ ...form, fecha: e.target.value })}
                    required
                    min={format(new Date(), 'yyyy-MM-dd')}
                  />
                </div>
                <div className="form-group">
                  <label>Hora *</label>
                  <input
                    type="time"
                    value={form.hora}
                    onChange={e => setForm({ ...form, hora: e.target.value })}
                    required
                    step={60}
                  />
                </div>
                <div className="form-group">
                  <label>Repetir</label>
                  <select
                    value={form.repetir}
                    onChange={e => setForm({ ...form, repetir: e.target.value as any })}
                  >
                    {REPETICIONES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Sonido</label>
                  <select
                    value={form.sonido}
                    onChange={e => setForm({ ...form, sonido: e.target.value })}
                  >
                    {SONIDOS.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div className="form-group full checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!editando || form.activa !== false}
                      onChange={e => setForm({ ...form, activa: e.target.checked })}
                    />
                    <span>Activar alarma</span>
                  </label>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={cerrarForm}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={guardando}>
                  {guardando ? <Loader2 size={18} className="spin" /> : <Save size={18} />} {editando ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de alarmas */}
      <div className="alarmas-lista">
        {cargando ? (
          <div className="loading"><Loader2 size={32} className="spin" /></div>
        ) : alarmas.length === 0 ? (
          <div className="empty-state">
            <BellOff size={48} />
            <h4>No hay alarmas</h4>
            <p>Crea tu primera alarma para empezar</p>
            <button className="btn-primary" onClick={() => abrirForm()}>
              <Plus size={18} /> Crear alarma
            </button>
          </div>
        ) : (
          <ul className="alarmas">
            {alarmas
              .sort((a, b) => {
                // Activas primero, luego por fecha/hora
                if (a.activa !== b.activa) return b.activa ? -1 : 1;
                return new Date(`${a.fecha}T${a.hora}`).getTime() - new Date(`${b.fecha}T${b.hora}`).getTime();
              })
              .map(alarma => (
                <li key={alarma.id} className={`alarma-item ${alarma.activa ? 'activa' : 'inactiva'} ${esProxima(alarma) ? 'proxima' : ''} ${esPasada(alarma) ? 'pasada' : ''}`}>
                  <div className="alarma-main">
                    <div className="alarma-toggle">
                      <input
                        type="checkbox"
                        checked={alarma.activa}
                        onChange={() => toggleActiva(alarma)}
                        disabled={cargando}
                      />
                    </div>
                    <div className="alarma-info">
                      <div className="alarma-titulo-row">
                        <strong>{alarma.titulo}</strong>
                        {esProxima(alarma) && <span className="badge proxima"><BellRing size={12} /> Próxima</span>}
                        {esPasada(alarma) && <span className="badge pasada"><AlertCircle size={12} /> Pasada</span>}
                        {!alarma.activa && <span className="badge inactiva"><BellOff size={12} /> Inactiva</span>}
                      </div>
                      <div className="alarma-meta">
                        <span><Calendar size={14} /> {formatearFecha(alarma.fecha)}</span>
                        <span><Clock size={14} /> {alarma.hora}</span>
                        {alarma.repetir !== 'ninguna' && (
                          <span><Repeat size={14} /> {formatearRepetir(alarma.repetir)}</span>
                        )}
                        <span><Volume2 size={14} /> {SONIDOS.find(s => s.id === alarma.sonido)?.nombre || alarma.sonido}</span>
                      </div>
                    </div>
                  </div>
                  <div className="alarma-actions">
                    <button className="btn-icon" onClick={() => abrirForm(alarma)} title="Editar"><Edit size={16} /></button>
                    <button className="btn-icon danger" onClick={() => eliminar(alarma.id)} title="Eliminar"><Trash2 size={16} /></button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}