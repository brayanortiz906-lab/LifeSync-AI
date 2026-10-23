import { useState, useEffect } from 'react';
import { 
  Brain, Cpu, MemoryStick, Download, CheckCircle, AlertCircle, 
  Loader2, Zap, Smartphone, Monitor, ChevronDown, ChevronUp,
  Info, Wifi, WifiOff, Battery, BatteryLow
} from 'lucide-react';
import { api } from '@/lib/api';
import './PanelIaMovil.css';

interface HardwareInfo {
  ram_total_gb: number;
  ram_disponible_gb: number;
  cpu_cores: number;
  cpu_threads: number;
  plataforma: string;
  arquitectura: string;
  gpu: { disponible: boolean; nombre: string; vram_gb: number };
}

interface ModeloRecomendado {
  modelo: string;
  tamano: string;
  motor: string;
  descripcion: string;
  ram_requerida: number;
  es_recomendado: boolean;
  categoria: string;
}

interface PanelIaMovilState {
  hardware: HardwareInfo | null;
  recomendacion: ModeloRecomendado | null;
  alternativas: ModeloRecomendado[];
  descargando: string | null;
  progreso: string;
  error: string | null;
  exito: string | null;
  expandido: boolean;
}

export function PanelIaMovil() {
  const [state, setState] = useState<PanelIaMovilState>({
    hardware: null,
    recomendacion: null,
    alternativas: [],
    descargando: null,
    progreso: '',
    error: null,
    exito: null,
    expandido: false,
  });

  useEffect(() => {
    cargarInfo();
  }, []);

  const cargarInfo = async () => {
    try {
      // Usar API local del navegador para hardware
      const hardware = detectarHardwareNavegador();
      setState(prev => ({ ...prev, hardware }));
      
      // Obtener recomendación del backend
      const rec = await api.get<ModeloRecomendado>('/ia-movil/recomendar', {
        params: { ram_gb: hardware.ram_disponible_gb, gpu_vram_gb: hardware.gpu.vram_gb }
      });
      
      const alts = await api.get<ModeloRecomendado[]>('/ia-movil/modelos', {
        params: { ram_gb: hardware.ram_disponible_gb, gpu_vram_gb: hardware.gpu.vram_gb }
      });
      
      setState(prev => ({ 
        ...prev, 
        recomendacion: rec, 
        alternativas: alts 
      }));
    } catch (e: any) {
      console.error('Error cargando IA móvil:', e);
      // Fallback local
      const hardware = detectarHardwareNavegador();
      const rec = recomendarLocal(hardware.ram_disponible_gb, hardware.gpu.vram_gb);
      setState(prev => ({ ...prev, hardware, recomendacion: rec }));
    }
  };

  const detectarHardwareNavegador = (): HardwareInfo => {
    // Navigator API + estimaciones
    const ram = (navigator as any).deviceMemory || 4; // GB
    const cores = navigator.hardwareConcurrency || 4;
    
    return {
      ram_total_gb: ram,
      ram_disponible_gb: Math.max(0.5, ram - 1.5), // Estimado SO usa ~1.5GB
      cpu_cores: Math.floor(cores / 2),
      cpu_threads: cores,
      plataforma: navigator.platform,
      arquitectura: 'unknown',
      gpu: { disponible: false, nombre: '', vram_gb: 0 },
    };
  };

  const recomendarLocal = (ram: number, vram: number): ModeloRecomendado => {
    if (ram < 3) return { modelo: 'qwen2.5:0.5b', tamano: '400 MB', motor: 'ollama', descripcion: 'Ultra ligero', ram_requerida: 2, es_recomendado: true, categoria: 'recomendado' };
    if (ram < 6) return { modelo: 'llama3.2:1b', tamano: '1.3 GB', motor: 'ollama', descripcion: 'Equilibrio', ram_requerida: 4, es_recomendado: true, categoria: 'recomendado' };
    if (ram < 10) return { modelo: 'gemma3:1b', tamano: '815 MB', motor: 'ollama', descripcion: 'Más capaz', ram_requerida: 6, es_recomendado: true, categoria: 'recomendado' };
    return { modelo: 'llama3.1:8b', tamano: '4.7 GB', motor: 'ollama', descripcion: 'Mejor calidad', ram_requerida: 8, es_recomendado: true, categoria: 'recomendado' };
  };

  const descargarModelo = async (modelo: string, motor: string) => {
    setState(prev => ({ ...prev, descargando: modelo, progreso: 'Iniciando...', error: null, exito: null }));
    
    try {
      // Usar backend para descargar con progreso SSE
      const response = await fetch(`${api.baseURL}/ia-movil/descargar`, {
        method: 'POST',
        headers: api.getHeaders(),
        body: JSON.stringify({ modelo, motor }),
      });
      
      if (!response.ok) throw new Error('Error en descarga');
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.progreso) {
                  setState(prev => ({ ...prev, progreso: data.progreso }));
                } else if (data.error) {
                  throw new Error(data.error);
                } else if (data.ok) {
                  setState(prev => ({ 
                    ...prev, 
                    descargando: null, 
                    exito: `✅ ${modelo} descargado correctamente`,
                    error: null 
                  }));
                  // Refrescar lista
                  setTimeout(() => cargarInfo(), 1000);
                }
              } catch (e) {
                console.error('Parse error:', e);
              }
            }
          }
        }
      }
    } catch (e: any) {
      setState(prev => ({ 
        ...prev, 
        descargando: null, 
        error: e.message || 'Error descargando modelo' 
      }));
    }
  };

  const toggleExpand = () => setState(prev => ({ ...prev, expandido: !prev.expandido }));

  if (!state.hardware) {
    return (
      <div className="panel-ia-movil loading">
        <div className="skeleton">
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
          <div className="skeleton-line" />
        </div>
      </div>
    );
  }

  const { hardware, recomendacion, alternativas, descargando, progreso, error, exito, expandido } = state;
  const ram = hardware.ram_disponible_gb;
  const esMovil = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

  return (
    <div className="panel-ia-movil">
      <div className="panel-header" onClick={toggleExpand}>
        <div className="header-left">
          <Brain className="icon" size={24} />
          <div>
            <h3>IA en tu móvil</h3>
            <p className="subtitle">Modelos locales que corren en tu dispositivo</p>
          </div>
        </div>
        <div className="header-right">
          <span className={`ram-badge ${ram < 4 ? 'low' : ram < 8 ? 'medium' : 'good'}`}>
            <MemoryStick size={14} /> {ram.toFixed(1)} GB RAM libre
          </span>
          <button className="expand-btn" onClick={toggleExpand} aria-label={expandido ? 'Colapsar' : 'Expandir'}>
            {expandido ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      {expandido && (
        <div className="panel-content">
          {/* Hardware Info */}
          <div className="section hardware-section">
            <h4><Cpu size={16} /> Hardware detectado</h4>
            <div className="hardware-grid">
              <div className="hw-item">
                <MemoryStick size={18} />
                <span>{hardware.ram_total_gb} GB total · {hardware.ram_disponible_gb.toFixed(1)} GB libre</span>
              </div>
              <div className="hw-item">
                <Cpu size={18} />
                <span>{hardware.cpu_cores} núcleos · {hardware.cpu_threads} hilos</span>
              </div>
              <div className="hw-item">
                <Smartphone size={18} />
                <span>{esMovil ? 'Móvil' : 'Escritorio'} · {hardware.plataforma}</span>
              </div>
              <div className="hw-item">
                {hardware.gpu.disponible ? (
                  <>
                    <Zap size={18} className="gpu" />
                    <span>GPU: {hardware.gpu.nombre} ({hardware.gpu.vram_gb} GB VRAM)</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={18} />
                    <span>Sin GPU dedicada (usará CPU)</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Recomendación Principal */}
          {recomendacion && (
            <div className="section recomendacion-section">
              <h4><CheckCircle size={16} className="recommended" /> Recomendado para ti</h4>
              <div className="modelo-card recommended">
                <div className="modelo-info">
                  <div className="modelo-header">
                    <strong>{recomendacion.modelo}</strong>
                    <span className="badge recommended-badge">RECOMENDADO</span>
                  </div>
                  <p className="modelo-desc">{recomendacion.descripcion}</p>
                  <div className="modelo-meta">
                    <span><MemoryStick size={14} /> {recomendacion.tamano}</span>
                    <span><Cpu size={14} /> {recomendacion.motor}</span>
                    <span>↓ {recomendacion.ram_requerida} GB RAM mín.</span>
                  </div>
                </div>
                <div className="modelo-actions">
                  <button 
                    className={`btn-descargar ${descargando === recomendacion.modelo ? 'descargando' : ''}`}
                    onClick={() => descargarModelo(recomendacion.modelo, recomendacion.motor)}
                    disabled={!!descargando}
                  >
                    {descargando === recomendacion.modelo ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        {progreso || 'Descargando...'}
                      </>
                    ) : (
                      <>
                        <Download size={16} /> Descargar
                      </>
                    )}
                  </button>
                </div>
                
                {descargando === recomendacion.modelo && (
                  <div className="progreso-descarga">
                    <div className="progreso-bar">
                      <div className="progreso-fill" style={{ width: progreso.includes('%') ? progreso : '0%' }} />
                    </div>
                    <small>{progreso}</small>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Alternativas */}
          {alternativas.length > 1 && (
            <div className="section alternativas-section">
              <h4><Info size={16} /> Otras opciones</h4>
              <div className="alternativas-grid">
                {alternativas.filter(m => m.modelo !== recomendacion?.modelo).slice(0, 6).map(m => (
                  <div key={m.modelo} className={`modelo-card alt ${m.categoria === 'apple_silicon' ? 'apple' : m.categoria === 'con_gpu' ? 'gpu' : m.categoria === 'ultra_ligero' ? 'ultra' : ''}`}>
                    <div className="modelo-info">
                      <div className="modelo-header">
                        <strong>{m.modelo}</strong>
                        <span className="badge">{m.categoria === 'recomendado' ? '★' : m.categoria.replace('_', ' ')}</span>
                      </div>
                      <p className="modelo-desc">{m.descripcion}</p>
                      <div className="modelo-meta">
                        <span><MemoryStick size={14} /> {m.tamano}</span>
                        <span><Cpu size={14} /> {m.motor}</span>
                        <span>↓ {m.ram_requerida} GB</span>
                      </div>
                    </div>
                    <button 
                      className="btn-descargar"
                      onClick={() => descargarModelo(m.modelo, m.motor)}
                      disabled={!!descargando}
                    >
                      <Download size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mensajes */}
          {error && (
            <div className="msg error">
              <AlertCircle size={18} /> {error}
            </div>
          )}
          {exito && (
            <div className="msg exito">
              <CheckCircle size={18} /> {exito}
            </div>
          )}

          {/* Notas */}
          <div className="notas">
            <h4><Info size={16} /> Notas importantes</h4>
            <ul>
              <li>Los modelos corren <strong>100% en tu dispositivo</strong> (sin internet, sin datos, privado).</li>
              <li>Requiere <strong>Ollama instalado</strong> (<a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com</a>).</li>
              <li>La primera descarga puede tardar varios minutos según tu conexión.</li>
              <li>{ram < 4 ? '⚠️ Con menos de 4 GB RAM, solo modelos ultra-ligeros funcionarán bien.' : '✅ Tu RAM permite modelos de buena calidad.'}</li>
              <li>{!hardware.gpu.disponible ? '💡 Sin GPU dedicada: la inferencia será en CPU (más lenta pero funciona).' : '🚀 GPU detectada: inferencia mucho más rápida.'}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}