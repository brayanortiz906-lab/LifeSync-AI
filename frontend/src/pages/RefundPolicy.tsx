import { useState } from 'react';
import { RotateCcw, CreditCard, Clock, HelpCircle, Mail, CheckCircle, XCircle } from 'lucide-react';
import { Panel, Boton } from '@/components/ui';
import { useNavigate } from 'react-router-dom';

export function RefundPolicy() {
  const navigate = useNavigate();

  const faqs = [
    {
      q: '¿LifeAgente AI tiene versión de pago?',
      a: 'No. LifeAgente AI es 100% gratuito y open-source (código en GitHub). No hay suscripciones, ni compras in-app, ni planes premium. Por tanto, no hay "reembolsos" porque no cobramos nada.',
    },
    {
      q: '¿Y los costes de las APIs de IA (Gemini, Groq, etc.)?',
      a: 'Tú traes tus propias claves API (BYOK). Los costes corren por tu cuenta directamente con cada proveedor (Google AI Studio, Groq, OpenRouter, etc.). LifeAgente AI no intermediamos pagos ni guardamos datos de tarjeta.',
    },
    {
      q: '¿Puedo recuperar dinero gastado en claves API de terceros?',
      a: 'No. Los cargos los hace el proveedor de la IA (Google, Groq, OpenRouter, etc.), no nosotros. Consulta la política de reembolsos de cada proveedor. LifeAgente AI no tiene acceso a tu facturación con ellos.',
    },
    {
      q: '¿Hay algún cargo oculto?',
      a: 'Cero. El código es abierto (MIT), la app es gratis, el backend en Supabase/Render/Vercel usa planes gratuitos. Si algún día hubiera una versión "Pro" opcional, se anunciaría con total transparencia y tendría su propia política.',
    },
    {
      q: '¿Y si dono al proyecto?',
      a: 'Las donaciones (GitHub Sponsors, Ko-fi, etc.) son voluntarias, no reembolsables y no desbloquean funcionalidades. Son un "gracias", no una compra.',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)] from-emerald-500/10 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto px-4 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-1.5 mb-6 text-sm font-medium text-emerald-300">
            <RotateCcw className="h-4 w-4" /> Actualizado: 25 oct 2026 · v2.2.0
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-emerald-300 bg-clip-text text-transparent">
            Política de Reembolsos
          </h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Respuesta corta: no hay nada que reembolsar porque la app es gratis. Detalles abajo.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-16 space-y-6">
        <Panel icono={<CreditCard className="h-5 w-5 text-emerald-400" />} titulo="Modelo de negocio: $0/mes para ti">
          <div className="space-y-4 text-slate-300 leading-relaxed">
            <p>LifeAgente AI se sostiene en tres pilares gratuitos:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Frontend:</strong> React + Vite deployado en Vercel (plan Free: 100 GB/mes).</li>
              <li><strong>Backend:</strong> FastAPI en Render (plan Free: 512 MB RAM, sleep tras 15 min inactividad).</li>
              <li><strong>Datos/Auth:</strong> Supabase Free (500 MB DB, 1 GB Storage, 50k MAU, Realtime).</li>
            </ul>
            <p>Tú solo pagas (si quieres) las llamadas a APIs de IA externas usando tus claves. Eso es entre tú y el proveedor.</p>
          </div>
        </Panel>

        <Panel icono={<HelpCircle className="h-5 w-5 text-emerald-400" />} titulo="Preguntas frecuentes">
          <div className="space-y-4">
            {faqs.map((f, i) => (
              <details key={i} className="group rounded-xl border border-white/10 bg-white/5 p-4 open:bg-emerald-500/5 open:border-emerald-500/20 transition-all">
                <summary className="flex items-start gap-3 cursor-pointer list-none font-medium text-slate-100">
                  <HelpCircle className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  {f.q}
                  <span className="ml-auto text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="mt-3 text-slate-400 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </Panel>

        <Panel icono={<Clock className="h-5 w-5 text-emerald-400" />} titulo="Si cambiamos de modelo en el futuro">
          <div className="space-y-3 text-slate-300 leading-relaxed">
            <p>Si alguna vez lanzamos una funcionalidad de pago opcional:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Se anunciará con <strong>30 días de antelación</strong> en la app y por email.</li>
              <li>Tendrá su propia <strong>política de reembolsos específica</strong> (ej. 14 días sin preguntas).</li>
              <li>Las funcionalidades actuales gratis <strong>seguirán siéndolo</strong>.</li>
            </ul>
          </div>
        </Panel>

        <div className="text-center">
          <Boton
            variante="secundario"
            onClick={() => navigate('/')}
            className="w-full sm:w-auto"
          >
            ← Volver al inicio
          </Boton>
        </div>

        <div className="text-center text-sm text-slate-500 border-t border-white/5 pt-8">
          <p>¿Dudas? <a href="mailto:billing@lifeagente.ai" className="text-emerald-400 hover:underline">billing@lifeagente.ai</a></p>
          <p className="mt-2">LifeAgente AI · <a href="/terms" className="text-emerald-400 hover:underline">Términos</a> · <a href="/privacy-policy" className="text-emerald-400 hover:underline">Privacidad</a> · <a href="/cookie-policy" className="text-emerald-400 hover:underline">Cookies</a></p>
        </div>
      </main>
    </div>
  );
}