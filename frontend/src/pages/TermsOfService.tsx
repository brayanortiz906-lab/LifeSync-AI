import { useState } from 'react';
import { FileText, Gavel, Scale, AlertCircle, CheckCircle, Clock, ArrowLeft } from 'lucide-react';
import { Panel, Boton } from '@/components/ui';
import { useNavigate } from 'react-router-dom';

export function TermsOfService() {
  const navigate = useNavigate();

  const sections = [
    {
      icon: FileText,
      title: '1. Aceptación de los términos',
      content: 'Al usar LifeAgente AI, aceptas estos términos. Si no estás de acuerdo, no uses el servicio. Podemos actualizar estos términos; la versión vigente siempre está en esta página con su fecha.',
    },
    {
      icon: Gavel,
      title: '2. Licencia y uso permitido',
      content: 'Te concedemos una licencia personal, intransferible y revocable para usar la app. No puedes: (a) revender, alquilar o sublicenciar el servicio; (b) hacer ingeniería inversa; (c) usar la app para actividades ilegales o dañinas; (d) interferir con la seguridad o integridad del servicio.',
    },
    {
      icon: Scale,
      title: '3. Tu contenido y responsabilidad',
      content: 'Eres dueño de tus datos (eventos, tareas, notas, gastos). Nos das licencia para almacenarlos, procesarlos y mostrarlos *solo* para prestarte el servicio. Eres responsable de la legalidad de tu contenido. No reclamamos propiedad sobre tus datos.',
    },
    {
      icon: AlertCircle,
      title: '4. IA y claves BYOK (Bring Your Own Key)',
      content: 'LifeAgente AI conecta con proveedores de IA (Gemini, Groq, OpenRouter, etc.) usando *tus* claves API. Tú gestionas tus claves; nosotros las encriptamos y nunca las vemos en claro. No garantizamos disponibilidad, precisión o continuidad de proveedores externos. El uso de IA conlleva costes en tu cuenta del proveedor; tú asumes esos costes.',
    },
    {
      icon: CheckCircle,
      title: '5. Servicios gratuitos y "Fair Use"',
      content: 'Los proveedores de IA gratis (Groq, OpenRouter, HuggingFace, etc.) tienen límites de tasa y cuotas. LifeAgente AI no controla esos límites. Si un proveedor falla o te bloquea, la app seguirá funcionando con otros motores o en modo local.',
    },
    {
      icon: Clock,
      title: '6. Disponibilidad y mantenimiento',
      content: 'Nos esforzamos por 99.9% uptime, pero no garantizamos disponibilidad ininterrumpida. Mantenimientos programados se avisarán con 24h de antelación cuando sea posible. El modo local (sin servidor) funciona siempre en tu dispositivo.',
    },
    {
      icon: Scale,
      title: '7. Limitación de responsabilidad',
      content: 'En la máxima medida permitida por ley: (a) el servicio se da "tal cual", sin garantías de ningún tipo; (b) no somos responsables por daños indirectos, incidentales o consecuentes; (c) nuestra responsabilidad total no excederá lo que nos hayas pagado (cero en plan gratis).',
    },
    {
      icon: FileText,
      title: '8. Privacidad y datos',
      content: 'Tu privacidad se rige por nuestra <a href="/privacy-policy" className="text-indigo-400 underline hover:text-indigo-300">Política de Privacidad</a>. Al usar el servicio, consientes el tratamiento descrito allí.',
    },
    {
      icon: Gavel,
      title: '9. Ley aplicable y jurisdicción',
      content: 'Estos términos se rigen por las leyes de España. Cualquier disputa se resolverá en los juzgados de Madrid, salvo que la ley obligue a otro fuero (consumidores).',
    },
    {
      icon: Clock,
      title: '10. Cambios y terminación',
      content: 'Podemos modificar el servicio o estos términos con aviso razonable. Puedes cerrar tu cuenta cuando quieras (Ajustes → Seguridad → Eliminar cuenta). Nos reservamos el derecho a suspender cuentas que violen estos términos.',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)] from-violet-500/10 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto px-4 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-1.5 mb-6 text-sm font-medium text-violet-300">
            <FileText className="h-4 w-4" /> Actualizado: 25 oct 2026 · v2.2.0
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-violet-300 bg-clip-text text-transparent">
            Términos y Condiciones
          </h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Lee con calma. Sin trucos, sin letra pequeña escondida. Esto rige tu relación con LifeAgente AI.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-16 space-y-6">
        {sections.map((s, i) => (
          <Panel key={i} icono={<s.icon className="h-5 w-5 text-violet-400" />} titulo={s.title} className="transition-all duration-300 hover:border-white/15 hover:shadow-xl hover:shadow-violet-500/5">
            <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed">
              <p dangerouslySetInnerHTML={{ __html: s.content }} />
            </div>
          </Panel>
        ))}

        <div className="text-center">
          <Boton
            variante="secundario"
            onClick={() => navigate('/')}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver al inicio
          </Boton>
        </div>

        <div className="text-center text-sm text-slate-500 border-t border-white/5 pt-8">
          <p>LifeAgente AI · <a href="/privacy-policy" className="text-indigo-400 hover:underline">Privacidad</a> · <a href="/cookie-policy" className="text-indigo-400 hover:underline">Cookies</a> · <a href="/refund-policy" className="text-indigo-400 hover:underline">Reembolsos</a></p>
        </div>
      </main>
    </div>
  );
}