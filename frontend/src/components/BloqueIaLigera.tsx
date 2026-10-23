import { useState, useEffect } from 'react';
import { 
  Sparkles, Zap, Download, CheckCircle, AlertCircle, Loader2, 
  Cpu, MemoryStick, Wifi, WifiOff, ExternalLink
} from 'lucide-react';
import { api } from '@/lib/api';
import './BloqueIaLigera.css';

interface ModeloLigero {
  id: string;
  nombre: string;
  tamano: string;
  motor: string;
  descripcion: string;
  ram_min: number;
  categoria: string;
  url: string;
}

export function BloqueIaLigera() {
  const [modelos, setModelos] = useState<ModeloLigero[]>([]);
  const [ram, setRam] = useState<number>(4);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    // Detectar RAM del navegador
    const ramGB = (navigator as any).deviceMemory || 4;
    setRam(ramGB);
    cargarModelos(ramGB);
  }, []);

  const cargarModelos = async (ramGB: number) => {
    try {
      const data = await api.get<ModeloLigero[]>('/ia-gratis/modelos-ligeros', {
        params: { ram_gb: ramGB }
      });
      setModelos(data);
    } catch (e) {
      // Fallback local
      setModelos(getModelosFallback(ramGB));
    }
  };

  const getModelosFallback = (ramGB: number): ModeloLigero[] => {
    const base = [
      { id: 'qwen2.5:0.5b', nombre: 'Qwen 2.5 0.5B', tamano: '400 MB', motor: 'ollama', descripcion: 'Ultra rápido, solo texto', ram_min: 1, categoria: 'ultra_ligero', url: 'https://ollama.com/library/qwen2.5:0.5b' },
      { id: 'smollm:135m', nombre: 'SmolLM 135M', tamano: '100 MB', motor: 'ollama', descripcion: 'Mínimo absoluto', ram_min: 1, categoria: 'ultra_ligero', url: 'https://ollama.com/library/smollm:135m' },
      { id: 'tinyllama:1.1b', nombre: 'TinyLlama 1.1B', tamano: '650 MB', motor: 'ollama', descripcion: 'Compacto y útil', ram_min: 2, categoria: 'ultra_ligero', url: 'https://ollama.com/library/tinyllama:1.1b' },
      { id: 'llama3.2:1b', nombre: 'Llama 3.2 1B', tamano: '1.3 GB', motor: 'ollama', descripcion: 'Equilibrio calidad/tamaño', ram_min: 3, categoria: 'ligero', url: 'https://ollama.com/library/llama3.2:1b' },
      { id: 'gemma3:1b', nombre: 'Gemma 3 1B', tamano: '815 MB', motor: 'ollama', descripcion: 'Google, buena calidad', ram_min: 4, categoria: 'ligero', url: 'https://ollama.com/library/gemma3:1b' },
      { id: 'phi3:3.8b', nombre: 'Phi-3 3.8B', tamano: '2.3 GB', motor: 'ollama', descripcion: 'Microsoft, buen razonamiento', ram_min: 6, categoria: 'medio', url: 'https://ollama.com/library/phi3:3.8b' },
    ];
    return base.filter(m => m.ram_min <= ramGB);
  };

  const descargar = async (modelo: ModeloLigero) => {
    setDescargando(modelo.id);
    setProgreso('Conectando...');
    setError(null);
    setExito(null);

    try {
      const response = await fetch(`${api.baseURL}/ia-gratis/descargar`, {
        method: 'POST',
        headers: api.getHeaders(),
        body: JSON.stringify({ modelo: modelo.id, motor: modelo.motor }),
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
                if (data.progreso) setProgreso(data.progreso);
                else if (data.error) throw new Error(data.error);
                else if (data.ok) {
                  setDescargando(null);
                  setExito(`✅ ${modelo.nombre} listo`);
                  setTimeout(() => cargarModelos(ram), 1000);
                }
              } catch (e) {
                console.error('Parse error:', e);
              }
            }
          }
        }
      }
    } catch (e: any) {
      setDescargando(null);
      setError(e.message || 'Error descargando');
    }
  };

  const getCategoriaInfo = (cat: string) => {
    switch (cat) {
      case 'ultra_ligero': return { icon: Zap, label: 'Ultra ligero (1-2 GB)', color: 'var(--success, #22c55e)' };
      case 'ligero': return { icon: Cpu, label: 'Ligero (3-5 GB)', color: 'var(--accent, #3b82f6)' };
      case 'medio': return { icon: MemoryStick, label: 'Medio (6-8 GB)', color: 'var(--warning, #f59e0b)' };
      default: return { icon: Sparkles, label: cat, color: 'var(--text-muted, #64748b)' };
    }
  };

  const getMotorIcon = (motor: string) => {
    switch (motor) {
      case 'ollama': return <Cpu size={16} />;
      case 'lmstudio': return <MemoryStick size={16} />;
      case 'vllm': return <Zap size={16} />;
      default: return <Sparkles size={16} />;
    }
  };

  if (modelos.length === 0) {
    return (
      <div className="bloque-ia-ligera empty">
        <p>No hay modelos disponibles para tu RAM ({ram} GB).</p>
        <p className="hint">Instala Ollama y prueba con modelos ultra-ligeros.</p>
        <a href="https://ollama.com/download" target="_blank" rel="noopener">
          <ExternalLink size={16} /> Descargar Ollama
        </a>
      </div>
    );
  }

  // Agrupar por categoría
  const categorias = modelos.reduce((acc, m) => {
    if (!acc[m.categoria]) acc[m.categoria] = [];
    acc[m.categoria].push(m);
    return acc;
  }, {} as Record<string, ModeloLigero[]>);

  const ordenCategorias = ['ultra_ligero', 'ligero', 'medio'];

  return (
    <div className="bloque-ia-ligera">
      <div className="header">
        <div className="header-left">
          <Sparkles size={24} className="icon" />
          <div>
            <h3>IA Ligera (Modelos locales)</h3>
            <p className="subtitle">
              Corren 100% en tu dispositivo · Sin internet · Privado · Gratis
            </p>
          </div>
        </div>
        <div className="ram-indicator">
          <MemoryStick size={16} /> {ram} GB RAM · Modelos viables: {modelos.length}
        </div>
      </div>

      {error && <div className="msg error"><AlertCircle size={18} /> {error}</div>}
      {exito && <div className="msg exito"><CheckCircle size={18} /> {exito}</div>}

      {ordenCategorias.map(cat => {
        const items = categorias[cat];
        if (!items || items.length === 0) return null;
        const { icon: Icon, label, color } = getCategoriaInfo(cat);
        
        return (
          <div key={cat} className="categoria-section">
            <div className="categoria-header">
              <Icon size={18} style={{ color }} />
              <span>{label}</span>
              <span className="count">{items.length} modelos</span>
            </div>
            <div className="modelos-grid">
              {items.map(modelo => (
                <div key={modelo.id} className="modelo-card">
                  <div className="modelo-info">
                    <div className="modelo-header">
                      <strong>{modelo.nombre}</strong>
                      <span className="motor-badge">{getMotorIcon(modelo.motor)} {modelo.motor}</span>
                    </div>
                    <p className="modelo-desc">{modelo.descripcion}</p>
                    <div className="modelo-meta">
                      <span><MemoryStick size={14} /> {modelo.tamano}</span>
                      <span>↓ {modelo.ram_min} GB RAM mín.</span>
                    </div>
                  </div>
                  <div className="modelo-actions">
                    <button
                      className={`btn-descargar ${descargando === modelo.id ? 'descargando' : ''}`}
                      onClick={() => descargar(modelo)}
                      disabled={!!descargando}
                    >
                      {descargando === modelo.id ? (
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
                    <a href={modelo.url} target="_blank" rel="noopener" className="btn-link">
                      <ExternalLink size={14} />
                    </a>
                  </div>

                  {descargando === modelo.id && (
                    <div className="progreso-descarga">
                      <div className="progreso-bar">
                        <div className="progreso-fill" style={{ width: progreso.includes('%') ? progreso : '0%' }} />
                      </div>
                      <small>{progreso}</small>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
      )})}

      <div className="notas">
        <h4><Info size={16} /> ¿Cómo funciona?</h4>
        <ul>
          <li>Requiere <a href="https://ollama.com/download" target="_blank" rel="noopener">Ollama instalado</a> (motor local).</li>
          <li>La descarga es <strong>una sola vez</strong>; luego el modelo corre offline.</li>
          <li>Los modelos "Ultra ligeros" funcionan incluso con 1-2 GB RAM libre.</li>
          <li>Sin GPU: usa CPU (más lento pero funcional). Con GPU NVIDIA: mucho más rápido.</li>
          <li>Privado total: tus datos nunca salen de tu dispositivo.</li>
        </ul>
      </div>
    </div>
  );
}

import { Info } from 'lucide-react';