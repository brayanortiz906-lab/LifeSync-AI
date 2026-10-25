import { Shield, Database, Globe, Cpu, Cloud, Key, Eye, AlertTriangle, CheckCircle, XCircle, Info, Megaphone } from 'lucide-react';
import { Panel, Chip } from '@/components/ui';
import { useState } from 'react';

interface SDKInfo {
  name: string;
  version: string;
  purpose: string;
  category: 'essential' | 'analytics' | 'marketing' | 'functional';
  privacyImpact: 'none' | 'low' | 'medium' | 'high';
  dataCollected: string[];
  domain: string;
  privacyPolicyUrl: string;
  required: boolean;
  description: string;
}

const SDK_REGISTRY: SDKInfo[] = [
  {
    name: 'Supabase JS Client',
    version: '2.39+',
    purpose: 'Backend-as-a-Service: Auth, Database, Realtime, Storage',
    category: 'essential',
    privacyImpact: 'medium',
    dataCollected: ['User ID', 'Email', 'Auth tokens', 'Realtime subscriptions', 'Database queries'],
    domain: '*.supabase.co',
    privacyPolicyUrl: 'https://supabase.com/privacy',
    required: true,
    description: 'Core backend infrastructure. All data protected by Row Level Security (RLS). Your data never leaves your user boundary.',
  },
  {
    name: 'Google Identity Services',
    version: '1.0+',
    purpose: 'OAuth 2.0 / OpenID Connect: "Sign in with Google"',
    category: 'functional',
    privacyImpact: 'high',
    dataCollected: ['Email', 'Name', 'Profile picture', 'OAuth tokens'],
    domain: 'accounts.google.com',
    privacyPolicyUrl: 'https://policies.google.com/privacy',
    required: false,
    description: 'Only loaded if you click "Sign in with Google". Scope limited to openid, email, profile. No access to Gmail/Drive unless you explicitly grant.',
  },
  {
    name: 'Google Calendar API',
    version: 'v3',
    purpose: 'Two-way calendar sync (read/write your events)',
    category: 'functional',
    privacyImpact: 'high',
    dataCollected: ['Calendar events', 'Calendar list', 'OAuth tokens'],
    domain: 'calendar.googleapis.com',
    privacyPolicyUrl: 'https://policies.google.com/privacy',
    required: false,
    description: 'Only activated when you enable Calendar Sync in Settings. Tokens encrypted with Fernet (AES-256). Revocable anytime.',
  },
  {
    name: 'Google Drive API',
    version: 'v3',
    purpose: 'Encrypted backups to your personal Drive',
    category: 'functional',
    privacyImpact: 'high',
    dataCollected: ['Backup files (encrypted)', 'File metadata', 'OAuth tokens'],
    domain: 'drive.googleapis.com',
    privacyPolicyUrl: 'https://policies.google.com/privacy',
    required: false,
    description: 'Only if you enable Drive Backups. Backups are encrypted client-side before upload. We cannot read them.',
  },
  {
    name: 'Gemini API (Google AI)',
    version: '1.5+',
    purpose: 'AI chat completions (your BYOK key)',
    category: 'functional',
    privacyImpact: 'medium',
    dataCollected: ['Chat messages (sent to Google)', 'Your API key (never stored by us)'],
    domain: 'generativelanguage.googleapis.com',
    privacyPolicyUrl: 'https://ai.google.dev/policies',
    required: false,
    description: 'Your API key, your requests, your data. We proxy requests but never log content. Key encrypted at rest with Fernet.',
  },
  {
    name: 'Groq API',
    version: '1.0+',
    purpose: 'Free ultra-fast LLM inference (Llama, Mixtral, Gemma)',
    category: 'functional',
    privacyImpact: 'low',
    dataCollected: ['Chat messages (sent to Groq)', 'Your API key'],
    domain: 'api.groq.com',
    privacyPolicyUrl: 'https://groq.com/privacy-policy/',
    required: false,
    description: 'Optional free tier. No key required for public models. Your prompts sent directly from browser.',
  },
  {
    name: 'OpenRouter API',
    version: '1.0+',
    purpose: 'Access 100+ models (free & paid) via single API',
    category: 'functional',
    privacyImpact: 'low',
    dataCollected: ['Chat messages', 'Your API key'],
    domain: 'openrouter.ai',
    privacyPolicyUrl: 'https://openrouter.ai/privacy',
    required: false,
    description: 'Aggregator for multiple providers. Check each model\'s privacy policy. Free tier available.',
  },
  {
    name: 'Hugging Face Inference API',
    version: '2.0+',
    purpose: 'Open-source models (Zephyr, Mistral, CodeLlama, etc.)',
    category: 'functional',
    privacyImpact: 'low',
    dataCollected: ['Chat messages', 'Your API key (optional)'],
    domain: 'api-inference.huggingface.co',
    privacyPolicyUrl: 'https://huggingface.co/privacy',
    required: false,
    description: 'Community models. Can run without key (rate limited). Your data processed by HF infrastructure.',
  },
  {
    name: 'Together AI',
    version: '1.0+',
    purpose: 'Open models with competitive pricing',
    category: 'functional',
    privacyImpact: 'low',
    dataCollected: ['Chat messages', 'Your API key'],
    domain: 'api.together.xyz',
    privacyPolicyUrl: 'https://www.together.ai/privacy',
    required: false,
    description: 'Llama, Mixtral, CodeLlama, etc. Pay-per-token. No logging by default.',
  },
  {
    name: 'Ollama (Local)',
    version: '0.1+',
    purpose: 'Run LLMs 100% locally on your machine',
    category: 'functional',
    privacyImpact: 'none',
    dataCollected: ['Nothing leaves your device'],
    domain: 'localhost:11434',
    privacyPolicyUrl: 'https://ollama.ai/privacy',
    required: false,
    description: 'Zero network calls. Models run on your CPU/GPU. Maximum privacy. Requires Ollama installed.',
  },
  {
    name: 'LM Studio (Local)',
    version: '0.2+',
    purpose: 'Local LLM server with OpenAI-compatible API',
    category: 'functional',
    privacyImpact: 'none',
    dataCollected: ['Nothing leaves your device'],
    domain: 'localhost:1234',
    privacyPolicyUrl: 'https://lmstudio.ai/privacy',
    required: false,
    description: 'Run any GGUF model locally. OpenAI-compatible endpoint. Full privacy, your hardware.',
  },
  {
    name: 'Tailwind CSS',
    version: '3.4+',
    purpose: 'Utility-first CSS framework',
    category: 'essential',
    privacyImpact: 'none',
    dataCollected: ['None'],
    domain: 'cdn.tailwindcss.com (dev only)',
    privacyPolicyUrl: 'https://tailwindcss.com/privacy-policy',
    required: true,
    description: 'Compile-time only. Zero runtime. No tracking, no network calls in production.',
  },
  {
    name: 'Lucide React',
    version: '0.460+',
    purpose: 'Beautiful consistent icons',
    category: 'essential',
    privacyImpact: 'none',
    dataCollected: ['None'],
    domain: 'N/A (bundled)',
    privacyPolicyUrl: 'https://lucide.dev/privacy',
    required: true,
    description: 'Tree-shaken SVG icons. Zero runtime, zero network, zero tracking.',
  },
  {
    name: 'React Router',
    version: '6.22+',
    purpose: 'Client-side routing',
    category: 'essential',
    privacyImpact: 'none',
    dataCollected: ['None'],
    domain: 'N/A (bundled)',
    privacyPolicyUrl: 'https://remix.run/privacy',
    required: true,
    description: 'Routing library. No analytics, no tracking.',
  },
  {
    name: 'TanStack Query',
    version: '5.24+',
    purpose: 'Server state management & caching',
    category: 'essential',
    privacyImpact: 'none',
    dataCollected: ['None'],
    domain: 'N/A (bundled)',
    privacyPolicyUrl: 'https://tanstack.com/privacy',
    required: true,
    description: 'Data fetching library. No telemetry.',
  },
  {
    name: 'Zustand',
    version: '4.5+',
    purpose: 'Lightweight state management',
    category: 'essential',
    privacyImpact: 'none',
    dataCollected: ['None'],
    domain: 'N/A (bundled)',
    privacyPolicyUrl: 'https://github.com/pmndrs/zustand#license',
    required: true,
    description: 'Minimal state store. No middleware by default, no tracking.',
  },
  {
    name: 'Vite',
    version: '5.1+',
    purpose: 'Build tool & dev server',
    category: 'essential',
    privacyImpact: 'none',
    dataCollected: ['None (dev only)'],
    domain: 'N/A (build-time)',
    privacyPolicyUrl: 'https://vitejs.dev/privacy',
    required: true,
    description: 'Development only. Stripped from production build.',
  },
];

const categoryLabels = {
  essential: { label: 'Esencial', icon: Shield, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  functional: { label: 'Funcional', icon: Cpu, color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  analytics: { label: 'Analíticas', icon: Database, color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  marketing: { label: 'Marketing', icon: Megaphone, color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
};

const impactLabels = {
  none: { label: 'Ninguno', icon: CheckCircle, color: 'text-emerald-400' },
  low: { label: 'Bajo', icon: Info, color: 'text-blue-400' },
  medium: { label: 'Medio', icon: AlertTriangle, color: 'text-amber-400' },
  high: { label: 'Alto', icon: AlertTriangle, color: 'text-rose-400' },
};

export function SDKAudit() {
  const [filter, setFilter] = useState<'all' | keyof typeof categoryLabels>('all');
  const [search, setSearch] = useState('');

  const filteredSDKs = SDK_REGISTRY.filter((sdk) => {
    const matchesFilter = filter === 'all' || sdk.category === filter;
    const matchesSearch = sdk.name.toLowerCase().includes(search.toLowerCase()) ||
      sdk.purpose.toLowerCase().includes(search.toLowerCase()) ||
      sdk.domain.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: SDK_REGISTRY.length,
    essential: SDK_REGISTRY.filter(s => s.category === 'essential').length,
    functional: SDK_REGISTRY.filter(s => s.category === 'functional').length,
    analytics: SDK_REGISTRY.filter(s => s.category === 'analytics').length,
    marketing: SDK_REGISTRY.filter(s => s.category === 'marketing').length,
    highImpact: SDK_REGISTRY.filter(s => s.privacyImpact === 'high').length,
    optional: SDK_REGISTRY.filter(s => !s.required).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
            Auditoría de SDKs de Terceros
          </h2>
          <p className="text-slate-400 mt-1">Transparencia total: qué carga la app, para qué y qué datos tocan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Buscar SDK, propósito, dominio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none w-full sm:w-64"
            aria-label="Buscar SDKs"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Shield} value={stats.total} label="Total SDKs" color="indigo" />
        <StatCard icon={CheckCircle} value={stats.essential} label="Esenciales" color="emerald" />
        <StatCard icon={Cpu} value={stats.functional} label="Funcionales (opcionales)" color="blue" />
        <StatCard icon={AlertTriangle} value={stats.highImpact} label="Impacto alto" color="rose" />
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por categoría">
        {(['all', 'essential', 'functional', 'analytics', 'marketing'] as const).map((cat) => {
          const info = categoryLabels[cat === 'all' ? 'essential' : cat];
          return (
            <button
              key={cat}
              role="tab"
              aria-selected={filter === cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                filter === cat
                  ? `bg-gradient-to-r ${info.color.replace('bg-', 'from-').replace('text-', 'to-').replace('border-', 'to-')} text-white shadow-lg`
                  : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 border border-white/10'
              }`}
            >
              {cat !== 'all' && <info.icon className="h-3 w-3 mr-1.5" />}
              {cat === 'all' ? 'Todos' : info.label}
            </button>
          );
        })}
      </div>

      {/* SDK Table */}
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" role="table">
            <thead>
              <tr className="border-b border-white/10 text-slate-500 uppercase tracking-wider text-[11px]">
                <th className="p-4 text-left">SDK</th>
                <th className="p-4 text-left hidden md:table-cell">Categoría</th>
                <th className="p-4 text-left hidden lg:table-cell">Impacto</th>
                <th className="p-4 text-left hidden xl:table-cell">Datos</th>
                <th className="p-4 text-left">Dominio</th>
                <th className="p-4 text-left">Requerido</th>
                <th className="p-4 text-left">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {filteredSDKs.map((sdk, i) => {
                const CatIcon = categoryLabels[sdk.category].icon;
                const ImpactIcon = impactLabels[sdk.privacyImpact].icon;
                return (
                  <tr key={sdk.name} className={`border-b border-white/5 transition-colors ${i % 2 === 0 ? 'bg-white/2' : 'bg-white/3'}`}>
                    <td className="p-4">
                      <div>
                        <div className="font-medium text-slate-100">{sdk.name}</div>
                        <div className="text-xs text-slate-500">{sdk.version}</div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <Chip className={categoryLabels[sdk.category].color}>
                        <CatIcon className="h-3 w-3 mr-1" />
                        {categoryLabels[sdk.category].label}
                      </Chip>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      <span className={`flex items-center gap-1 ${impactLabels[sdk.privacyImpact].color}`}>
                        <ImpactIcon className="h-3 w-3" />
                        {impactLabels[sdk.privacyImpact].label}
                      </span>
                    </td>
                    <td className="p-4 hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {sdk.dataCollected.slice(0, 3).map((d, j) => (
                          <Chip key={j} className="text-[10px] bg-white/5 text-slate-400 border-white/10">{d}</Chip>
                        ))}
                        {sdk.dataCollected.length > 3 && (
                          <Chip className="text-[10px] bg-white/5 text-slate-500 border-white/10">+{sdk.dataCollected.length - 3}</Chip>
                        )}
                      </div>
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-400">{sdk.domain}</td>
                    <td className="p-4">
                      {sdk.required ? (
                        <Chip className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-xs">Sí</Chip>
                      ) : (
                        <Chip className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">Opcional</Chip>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <a
                          href={sdk.privacyPolicyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                          aria-label={`Política de privacidad de ${sdk.name}`}
                        >
                          <Globe className="h-3 w-3" /> Privacidad
                        </a>
                        <button
                          onClick={() => alert(sdk.description)}
                          className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                          aria-label={`Ver detalles de ${sdk.name}`}
                        >
                          <Info className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredSDKs.length === 0 && (
          <div className="p-8 text-center text-slate-500">No se encontraron SDKs con ese filtro.</div>
        )}
      </Panel>

      {/* Summary */}
      <Panel icono={<Info className="h-5 w-5 text-indigo-400" />} titulo="Resumen de cumplimiento" className="border-indigo-500/20 bg-indigo-500/5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 rounded-xl bg-white/5">
            <h4 className="font-semibold text-indigo-300 mb-2">✅ Cumplimos</h4>
            <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
              <li>Sin trackers ocultos ni fingerprinting</li>
              <li>Todos los SDKs funcionales son opt-in</li>
              <li>Claves BYOK encriptadas (Fernet/AES-256)</li>
              <li>RLS: aislamiento total entre usuarios</li>
            </ul>
          </div>
          <div className="p-4 rounded-xl bg-white/5">
            <h4 className="font-semibold text-amber-300 mb-2">⚠️ Atención</h4>
            <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
              <li>Google OAuth/Calendar/Drive: datos van a Google</li>
              <li>Proveedores IA: leen tus prompts (su política)</li>
              <li>Supabase: ve metadatos de uso (no contenido)</li>
            </ul>
          </div>
          <div className="p-4 rounded-xl bg-white/5">
            <h4 className="font-semibold text-emerald-300 mb-2">🛡️ Tú controlas</h4>
            <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
              <li>Desactiva Calendar/Drive en Ajustes</li>
              <li>Usa Ollama/LM Studio para 100% local</li>
              <li>Elimina cuenta → borra TODO (incluye tokens)</li>
              <li>Exporta tus datos en JSON 언제든</li>
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function StatCard({ icon: Icon, value, label, color }: { icon: React.ComponentType<{ className?: string }>; value: number; label: string; color: string }) {
  const colors = {
    indigo: 'from-indigo-500 to-indigo-600',
    emerald: 'from-emerald-500 to-emerald-600',
    blue: 'from-blue-500 to-blue-600',
    rose: 'from-rose-500 to-rose-600',
  };
  const gradientStyle = { background: `linear-gradient(135deg, ${colors[color as keyof typeof colors]})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties;
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <span style={gradientStyle}><Icon className="h-5 w-5" /></span>
        <span className="text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent" style={gradientStyle}>{value}</span>
      </div>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}