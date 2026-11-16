import { useMemo, useState } from 'react';
import { ArrowRight, HelpCircle, Search, X } from 'lucide-react';
import type { AppView } from './AppLayout';

interface HelpGuideItem {
  id: string;
  section: string;
  title: string;
  summary: string;
  steps: string[];
  keywords: string[];
  targetView?: AppView;
  actionLabel?: string;
}

const HELP_GUIDES: HelpGuideItem[] = [
  {
    id: 'transfer-usdt-cash',
    section: 'Resumen · Transferencias',
    title: '¿Cómo cambiar USDT (Binance) a dólares en efectivo o viceversa?',
    summary:
      'Usa la pestaña "Cambiar / Transferir" para mover dinero entre fondos y sobres sin alterar tu patrimonio total.',
    steps: [
      'En Resumen, toca el botón azul "Cambiar / Transferir".',
      'En "Sale de (Origen)" elige Inversiones Binance (USDT) (o el preset rápido "USDT → Efectivo Sobres").',
      'En "Entra a (Destino)" elige el sobre donde guardarás el efectivo (ej. Imprescindibles o Ahorro).',
      'Ingresa el monto que salió (ej. 100) y, si hubo comisión P2P, coloca el monto neto recibido.',
      'Confirma: se resta de Binance y se suma automáticamente al sobre elegido.',
    ],
    keywords: [
      'cambiar',
      'cambio',
      'usdt',
      'usdc',
      'binance',
      'efectivo',
      'cash',
      'dolares',
      'billetes',
      'p2p',
      'transferir',
      'transferencia',
      'mover',
      'pasar',
      'fondo',
      'sobre',
    ],
    targetView: 'resumen',
    actionLabel: 'Ir a Resumen',
  },
  {
    id: 'quick-expense',
    section: 'Resumen · Gastos Rápidos',
    title: '¿Cómo registrar un gasto diario o un cambio a Bolívares?',
    summary:
      'Registra cualquier salida de dinero en menos de 15 segundos desde la pantalla principal.',
    steps: [
      'En Resumen, toca "Gasto Rápido" (o el botón + dentro de la tarjeta de cualquier sobre).',
      'Ingresa el monto en USD (puedes usar los botones rápidos $5, $10, $20, $50, $100).',
      'Elige el tipo: "Gasto en Efectivo" o "Cambio a Bolívares".',
      'Selecciona el sobre (ej. Imprescindibles o Disfrute) y agrega una nota opcional.',
    ],
    keywords: [
      'gasto',
      'rapido',
      'comprar',
      'mercado',
      'comida',
      'bolivares',
      'bs',
      'pago movil',
      'pagomovil',
      'salida',
      'egreso',
      'efectivo',
      'sobre',
    ],
    targetView: 'resumen',
    actionLabel: 'Ir a Resumen',
  },
  {
    id: 'register-quincena',
    section: 'Registrar Quincena',
    title: '¿Cómo repartir mi quincena o sueldo en los 4 sobres?',
    summary:
      'El Wizard calcula automáticamente cuánto apartar para gastos fijos/cuotas y cuánto va a cada sobre.',
    steps: [
      'Abre la pestaña "Quincena".',
      'Escribe el monto recibido en USD y selecciona cómo te lo pagaron (Efectivo USD, Binance USDT, Bs/Pago Móvil, Otro).',
      'Activa o desactiva la provisión automática para gastos mensuales/anuales y cuotas.',
      'Ajusta los porcentajes (%) o montos fijos ($) de tus 4 sobres y toca "Guardar por defecto" si quieres conservar esa regla.',
      'Revisa la vista previa "Dónde separar cada dólar" y toca "Confirmar y Separar".',
    ],
    keywords: [
      'quincena',
      'sueldo',
      'salario',
      'pago',
      'cobro',
      'repartir',
      'distribuir',
      'sobres',
      'porcentaje',
      'provision',
      'ingreso',
      'wizard',
    ],
    targetView: 'quincena',
    actionLabel: 'Ir a Quincena',
  },
  {
    id: 'recurring-expenses',
    section: 'Gastos y Pagos',
    title: '¿Cómo controlar gastos mensuales, anuales y saber cuánto apartar?',
    summary:
      'Cada gasto muestra los días restantes y calcula la cuota quincenal recomendada (prorrateo).',
    steps: [
      'Abre la pestaña "Gastos".',
      'Usa el botón "+ Nuevo" para agregar servicios mensuales (ej. Internet), quincenales o anuales (ej. Seguro, ISLR).',
      'Los gastos anuales se dividen entre 24 quincenas y los mensuales entre 2 para que nunca te quedes sin liquidez.',
      'Cuando pagues un servicio, presiona "Pagar": la app registra el egreso en el ledger y avanza la fecha al próximo mes/año.',
    ],
    keywords: [
      'gastos',
      'mensual',
      'anual',
      'quincenal',
      'prorrateo',
      'dias',
      'restantes',
      'vence',
      'alerta',
      'pagar',
      'internet',
      'netflix',
      'spotify',
      'seguro',
      'islr',
      'factura',
    ],
    targetView: 'gastos',
    actionLabel: 'Ir a Gastos y Pagos',
  },
  {
    id: 'installment-matrix',
    section: 'Gastos y Pagos · Cuotas',
    title: '¿Cómo llevar cuotas semanales o pagos con tope (ej. Moto)?',
    summary:
      'La Matriz de Pagos Recurrentes mide el acumulado pagado frente a la meta o tope máximo.',
    steps: [
      'En la parte inferior de "Gastos", entra en "Matriz de Pagos Recurrentes y Cuotas".',
      'Toca "+ Nueva Cuota" para crear un plan semanal, quincenal o mensual (con tope opcional, ej. $2,500).',
      'Cada vez que abones una cuota, toca "+ Registrar Cuota": sube el progreso y se descuenta automáticamente en el ledger.',
    ],
    keywords: [
      'cuota',
      'cuotas',
      'semanal',
      'moto',
      'tope',
      'matriz',
      'progreso',
      'abono',
      'financiamiento',
      'deuda',
      'recurrente',
      'suscripcion',
    ],
    targetView: 'gastos',
    actionLabel: 'Ir a Gastos y Pagos',
  },
  {
    id: 'crypto-dca',
    section: 'Portafolio Crypto',
    title: '¿Cómo usar el Portafolio Crypto (DCA) y subir/bajar CSV?',
    summary:
      'Consulta precios en vivo de CoinGecko, tu P&L, precio promedio de compra y metas de compra/venta.',
    steps: [
      'Abre la pestaña "Crypto".',
      'En desktop verás el formulario y botones "Upload CSV / Export CSV" en la barra lateral; en móvil tócalos desde el icono de menú (☰) arriba a la izquierda.',
      'Usa "Refresh Prices" para actualizar cotizaciones y configura tu API key de CoinGecko o stablecoins en "Settings".',
    ],
    keywords: [
      'crypto',
      'btc',
      'bitcoin',
      'eth',
      'dca',
      'portafolio',
      'csv',
      'coingecko',
      'precios',
      'pnl',
      'comprar',
      'vender',
      'monedas',
    ],
    targetView: 'crypto',
    actionLabel: 'Ir a Crypto',
  },
  {
    id: 'backup-privacy',
    section: 'Seguridad y Respaldo',
    title: '¿Cómo hacer respaldo JSON o ocultar los montos en pantalla?',
    summary:
      'Tus datos viven en tu navegador (localStorage). Puedes exportarlos en JSON o activar el modo privacidad.',
    steps: [
      'Para ocultar todos los saldos en pantalla pública, toca el botón del ojo ("Ocultar Montos") arriba a la derecha.',
      'Al final de la vista "Resumen", en "Respaldo Local (JSON)", toca "Exportar JSON" para descargar una copia completa.',
      'Si cambias de teléfono o navegador, usa "Importar JSON" para restaurar todo tu historial al instante.',
    ],
    keywords: [
      'respaldo',
      'backup',
      'json',
      'exportar',
      'importar',
      'guardar',
      'celular',
      'telefono',
      'privacidad',
      'ocultar',
      'ojo',
      'asteriscos',
      'demo',
      'reiniciar',
    ],
    targetView: 'resumen',
    actionLabel: 'Ir a Resumen',
  },
];

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function scoreGuide(item: HelpGuideItem, rawQuery: string): number {
  const query = normalizeText(rawQuery);
  if (!query) return 1;

  const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return 1;

  const titleNorm = normalizeText(item.title);
  const summaryNorm = normalizeText(item.summary);
  const stepsNorm = normalizeText(item.steps.join(' '));
  const keywordsNorm = item.keywords.map(normalizeText);

  let score = 0;

  // Phrase match bonus
  if (titleNorm.includes(query)) score += 12;
  if (summaryNorm.includes(query)) score += 8;

  for (const token of tokens) {
    if (keywordsNorm.some((k) => k === token)) {
      score += 10;
    } else if (keywordsNorm.some((k) => k.includes(token) || token.includes(k))) {
      score += 6;
    }
    if (titleNorm.includes(token)) score += 5;
    if (summaryNorm.includes(token)) score += 3;
    if (stepsNorm.includes(token)) score += 2;
  }

  return score;
}

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: AppView) => void;
}

export function HelpModal({ isOpen, onClose, onNavigate }: HelpModalProps) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return HELP_GUIDES.map((item) => ({ item, score: 1 }));
    }

    return HELP_GUIDES.map((item) => ({ item, score: scoreGuide(item, trimmed) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [query]);

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2">
              <HelpCircle size={20} className="text-accent-blue" /> Guía Rápida (How To)
            </h3>
            <p className="text-xs text-text-muted">
              Escribe lo que quieres hacer y te mostramos la respuesta más cercana.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary bg-bg-input border-none cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search bar */}
        <div className="p-4 border-b border-border shrink-0 space-y-2.5">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Ej. "cambiar usdt a efectivo", "repartir quincena", "cuota moto"...'
              className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {['USDT a efectivo', 'Registrar quincena', 'Gasto anual', 'Cuota moto', 'Respaldo JSON'].map(
              (chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setQuery(chip)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-bg-input border border-border text-text-muted hover:text-text-primary hover:border-accent-blue cursor-pointer"
                >
                  {chip}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Results */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5">
          {results.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm font-semibold text-text-primary">
                No encontré una guía exacta para &ldquo;{query}&rdquo;.
              </p>
              <p className="text-xs text-text-muted">
                Prueba con palabras como: <code>usdt</code>, <code>efectivo</code>,{' '}
                <code>quincena</code>, <code>gasto</code>, <code>cuota</code>,{' '}
                <code>crypto</code> o <code>respaldo</code>.
              </p>
            </div>
          ) : (
            results.map(({ item }, idx) => {
              const isTopMatch = hasQuery && idx === 0;
              return (
                <div
                  key={item.id}
                  className={`rounded-xl p-4 border space-y-2.5 ${
                    isTopMatch
                      ? 'bg-accent-blue/10 border-accent-blue/40'
                      : 'bg-bg-input/40 border-border'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      {item.section}
                    </span>
                    {isTopMatch && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-blue text-white">
                        Respuesta más cercana
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-text-primary">{item.title}</h4>
                  <p className="text-xs text-text-muted">{item.summary}</p>

                  <ol className="list-decimal list-inside space-y-1 text-xs text-text-primary/90 pt-1">
                    {item.steps.map((step, i) => (
                      <li key={i} className="leading-relaxed">
                        {step}
                      </li>
                    ))}
                  </ol>

                  {item.targetView && item.actionLabel && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate(item.targetView!);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-card border border-border text-accent-blue hover:border-accent-blue cursor-pointer"
                      >
                        {item.actionLabel} <ArrowRight size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
