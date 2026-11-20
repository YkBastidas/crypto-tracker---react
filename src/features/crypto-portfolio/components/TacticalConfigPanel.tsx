import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { DEFAULT_TACTICAL_DIP_CONFIG, sanitizeTacticalDipConfig } from '../../../shared/lib/storage';
import type {
  CoinHolding,
  TacticalDipConfig,
  TacticalProfilePresetId,
  TargetAllocations,
} from '../types';
import {
  buildPresetTacticalConfig,
  evaluateTacticalConfigRisk,
  formatUsd,
  recommendTacticalTiersFromIncome,
  simulateTacticalConfigImpact,
  type PresetKey,
} from '../utils/calculations';

interface TacticalConfigPanelProps {
  savedConfig: TacticalDipConfig;
  holdings: CoinHolding[];
  ahorroEnvelopeUsd: number;
  unassignedUsdtUsd: number;
  totalEligibleUsd: number;
  excludedPhysicalCashUsd: number;
  targetAllocations: TargetAllocations;
  isPrivate: boolean;
  onSave: (nextConfig: TacticalDipConfig) => void;
  onClose: () => void;
}

interface ParamFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  helpText: string;
  tooltip: string;
  accent?: 'blue' | 'gold';
  onChange: (value: number) => void;
}

function ParamField({
  label,
  value,
  min = 0,
  max,
  step = 1,
  helpText,
  tooltip,
  accent = 'blue',
  onChange,
}: ParamFieldProps) {
  const focusBorder =
    accent === 'gold' ? 'focus:border-accent-gold' : 'focus:border-accent-blue';
  const labelColor = accent === 'gold' ? 'text-accent-gold' : 'text-text-primary';

  return (
    <label className="block bg-bg-input/40 border border-border/80 rounded-lg p-2.5 space-y-1">
      <div className="flex items-center justify-between gap-1.5">
        <span className={`text-[11px] font-semibold ${labelColor}`}>{label}</span>
        <span
          title={tooltip}
          className="text-text-muted hover:text-text-primary cursor-help shrink-0"
        >
          <HelpCircle size={12} />
        </span>
      </div>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          const safe = Number.isFinite(parsed) ? Math.max(min, parsed) : min;
          onChange(max !== undefined ? Math.min(max, safe) : safe);
        }}
        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium bg-bg-card border border-border text-text-primary focus:outline-none ${focusBorder}`}
      />
      <p className="text-[10px] text-text-muted leading-snug line-clamp-2">{helpText}</p>
    </label>
  );
}

const PRESET_CARDS: Array<{
  id: PresetKey;
  title: string;
  badge?: string;
  desc: string;
}> = [
  {
    id: 'conservador',
    title: 'Conservador',
    desc: 'Cupo diario 25%, cooldown 72h y caídas más exigentes para estirar la liquidez.',
  },
  {
    id: 'equilibrado',
    title: 'Equilibrado',
    badge: 'Estándar recomendado',
    desc: 'Cupo 40% neto, cooldown 48h, reparto 60/40 multi-activo y escalones Crypto/Oro.',
  },
  {
    id: 'agresivo',
    title: 'Agresivo',
    desc: 'Cupo diario 65%, cooldown 24h y umbrales anticipados para desplegar más rápido.',
  },
];

function configsEqual(a: TacticalDipConfig, b: TacticalDipConfig): boolean {
  const keys = Object.keys(DEFAULT_TACTICAL_DIP_CONFIG) as Array<keyof TacticalDipConfig>;
  return keys.every((k) => a[k] === b[k]);
}

export function TacticalConfigPanel({
  savedConfig,
  holdings,
  ahorroEnvelopeUsd,
  unassignedUsdtUsd,
  totalEligibleUsd,
  excludedPhysicalCashUsd,
  targetAllocations,
  isPrivate,
  onSave,
  onClose,
}: TacticalConfigPanelProps) {
  const cleanSaved = useMemo(
    () => sanitizeTacticalDipConfig({ ...DEFAULT_TACTICAL_DIP_CONFIG, ...savedConfig }),
    [savedConfig],
  );
  const [draft, setDraft] = useState<TacticalDipConfig>(() => cleanSaved);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pendingRedConfirm, setPendingRedConfirm] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [previewNowMs] = useState(() => Date.now());

  const pv = (val: string) => (isPrivate ? '****' : val);

  const sanitizedDraft = useMemo(
    () => sanitizeTacticalDipConfig({ ...DEFAULT_TACTICAL_DIP_CONFIG, ...draft }),
    [draft],
  );

  const risk = useMemo(
    () => evaluateTacticalConfigRisk(sanitizedDraft),
    [sanitizedDraft],
  );

  const impact = useMemo(
    () =>
      simulateTacticalConfigImpact({
        holdings,
        eligibleCapitalUsd: totalEligibleUsd,
        targetAllocations,
        currentConfig: cleanSaved,
        candidateConfig: sanitizedDraft,
        nowMs: previewNowMs,
      }),
    [holdings, totalEligibleUsd, targetAllocations, cleanSaved, sanitizedDraft, previewNowMs],
  );

  const isDirty = !configsEqual(cleanSaved, sanitizedDraft);
  const activePreset: TacticalProfilePresetId = sanitizedDraft.presetId ?? 'equilibrado';

  const patchDraft = (patch: Partial<TacticalDipConfig>, markCustom = false) => {
    setPendingRedConfirm(false);
    setJustSaved(false);
    setDraft((prev) =>
      sanitizeTacticalDipConfig({
        ...DEFAULT_TACTICAL_DIP_CONFIG,
        ...prev,
        ...patch,
        presetId: markCustom ? 'personalizado' : (patch.presetId ?? prev.presetId),
      }),
    );
  };

  const handleSelectPreset = (presetId: PresetKey) => {
    setPendingRedConfirm(false);
    setJustSaved(false);
    setDraft((prev) =>
      buildPresetTacticalConfig(presetId, prev.monthlyIncomeUsd, prev.biweeklyDcaReserveUsd),
    );
  };

  const handleRecalculateFromIncome = () => {
    const presetForScale: PresetKey =
      activePreset === 'personalizado' ? 'equilibrado' : activePreset;
    const scaled = recommendTacticalTiersFromIncome(sanitizedDraft.monthlyIncomeUsd, presetForScale);
    patchDraft({
      tier1Usd: scaled.tier1Usd,
      tier2Usd: scaled.tier2Usd,
      tier3Usd: scaled.tier3Usd,
      biweeklyDcaReserveUsd: scaled.biweeklyDcaReserveUsd,
      presetId: activePreset,
    });
  };

  const handleRestoreRecommended = () => {
    setPendingRedConfirm(false);
    setJustSaved(false);
    setDraft(buildPresetTacticalConfig('equilibrado', DEFAULT_TACTICAL_DIP_CONFIG.monthlyIncomeUsd));
  };

  const commitSave = () => {
    onSave(sanitizedDraft);
    setPendingRedConfirm(false);
    setJustSaved(true);
  };

  const handleRequestSave = () => {
    if (risk.level === 'red' && !pendingRedConfirm) {
      setPendingRedConfirm(true);
      return;
    }
    commitSave();
  };

  const riskStyles =
    risk.level === 'red'
      ? 'bg-accent-red/10 border-accent-red/40 text-accent-red'
      : risk.level === 'yellow'
        ? 'bg-accent-gold/10 border-accent-gold/40 text-accent-gold'
        : 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300';

  const RiskIcon =
    risk.level === 'red'
      ? ShieldAlert
      : risk.level === 'yellow'
        ? AlertTriangle
        : ShieldCheck;

  const formatSignedDelta = (delta: number) => {
    if (Math.abs(delta) < 0.01) return '$0.00';
    return `${delta > 0 ? '+' : '-'}${formatUsd(Math.abs(delta))}`;
  };

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
            <SlidersHorizontal size={14} className="text-accent-gold" />
            Configuración del Motor Táctico · Gestión de Liquidez
          </h4>
          <p className="text-[11px] text-text-muted mt-0.5">
            Dosifica solo tu USDT digital libre en Binance ({pv(formatUsd(ahorroEnvelopeUsd))} sobre Ahorro +{' '}
            {pv(formatUsd(unassignedUsdtUsd))} USDT sin sobre).
            {excludedPhysicalCashUsd > 0 && (
              <> Excluido efectivo físico: {pv(formatUsd(excludedPhysicalCashUsd))}.</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRestoreRecommended}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-bg-input border border-border text-text-muted hover:text-text-primary hover:border-accent-blue cursor-pointer"
          >
            <RotateCcw size={11} />
            <span>Restaurar estándar recomendado</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración del motor táctico"
            className="p-1.5 rounded-lg bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Live Risk Traffic Light */}
      <div className={`rounded-xl border p-3 text-xs space-y-1.5 ${riskStyles}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold flex items-center gap-1.5">
            <RiskIcon size={15} />
            {risk.headline}
          </span>
          {risk.estimatedDaysToExhaustNetLiquidity !== null && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg-primary/40 border border-current/25">
              Ritmo máx.: ~{risk.estimatedDaysToExhaustNetLiquidity} días al cupo diario
            </span>
          )}
        </div>
        <p className="text-[11px] opacity-90 leading-snug">{risk.summary}</p>
        {risk.warnings.length > 0 && (
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-text-primary/90">
            {risk.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      {/* 1. Simple View (Default) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Vista Sencilla · Perfiles y Liquidez Base
          </span>
          {activePreset === 'personalizado' && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-blue/15 border border-accent-blue/40 text-accent-blue">
              Perfil Personalizado activo
            </span>
          )}
        </div>

        {/* Presets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {PRESET_CARDS.map((preset) => {
            const isSelected = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer space-y-1 ${
                  isSelected
                    ? 'bg-accent-blue/15 border-accent-blue text-text-primary'
                    : 'bg-bg-input/50 border-border text-text-muted hover:text-text-primary hover:border-border/90'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold">{preset.title}</span>
                  {preset.badge && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      {preset.badge}
                    </span>
                  )}
                </div>
                <p className="text-[10px] leading-snug opacity-85">{preset.desc}</p>
              </button>
            );
          })}

          <div
            className={`p-2.5 rounded-xl border space-y-1 ${
              activePreset === 'personalizado'
                ? 'bg-accent-gold/10 border-accent-gold/50 text-text-primary'
                : 'bg-bg-input/30 border-border/60 text-text-muted/75'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold">Personalizado</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-bg-card border border-border">
                {activePreset === 'personalizado' ? 'Activo' : 'Auto'}
              </span>
            </div>
            <p className="text-[10px] leading-snug">
              Se activa automáticamente si ajustas reglas individuales en la Vista Avanzada.
            </p>
          </div>
        </div>

        {/* Monthly income + DCA reserve */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-bg-input/40 border border-border rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-text-primary">
                Ingreso mensual base ($)
              </span>
              <span
                title="Referencia de flujo mensual para dimensionar los bloques fijos de cada nivel sin descapitalizarte."
                className="text-text-muted cursor-help"
              >
                <HelpCircle size={12} />
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={50}
                value={sanitizedDraft.monthlyIncomeUsd}
                onChange={(e) =>
                  patchDraft({
                    monthlyIncomeUsd: Math.max(0, parseFloat(e.target.value) || 0),
                  })
                }
                className="flex-1 px-2.5 py-1.5 rounded-lg text-xs bg-bg-card border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
              <button
                type="button"
                onClick={handleRecalculateFromIncome}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-blue/20 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30 cursor-pointer shrink-0"
              >
                Recalcular bloques
              </button>
            </div>
            <p className="text-[10px] text-text-muted leading-snug">
              Escala proporcionalmente los montos N1/N2/N3 y la reserva quincenal según tu flujo mensual.
            </p>
          </div>

          <div className="bg-bg-input/40 border border-border rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-text-primary">
                Reserva protegida para DCA regular ($)
              </span>
              <span
                title="Este monto se descuenta antes de calcular tu Liquidez Táctica Neta y tu Cupo Máximo Diario."
                className="text-text-muted cursor-help"
              >
                <HelpCircle size={12} />
              </span>
            </div>
            <input
              type="number"
              min={0}
              step={5}
              value={sanitizedDraft.biweeklyDcaReserveUsd}
              onChange={(e) =>
                patchDraft({
                  biweeklyDcaReserveUsd: Math.max(0, parseFloat(e.target.value) || 0),
                })
              }
              className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-bg-card border border-border text-text-primary focus:outline-none focus:border-accent-blue"
            />
            <p className="text-[10px] text-text-muted leading-snug">
              Aparta primero el efectivo digital de tu próximo DCA quincenal; nunca se consume en caídas.
            </p>
          </div>
        </div>

        {/* 4-Card Live Net Liquidity Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-bg-input/60 border border-border rounded-lg p-2.5">
            <span className="text-[10px] text-text-muted block">USDT Digital Libre</span>
            <strong className="text-accent-blue text-sm">{pv(formatUsd(totalEligibleUsd))}</strong>
          </div>
          <div className="bg-bg-input/60 border border-border rounded-lg p-2.5">
            <span className="text-[10px] text-text-muted block">Reserva DCA Regular</span>
            <strong className="text-text-primary text-sm">
              -{pv(formatUsd(sanitizedDraft.biweeklyDcaReserveUsd))}
            </strong>
          </div>
          <div className="bg-bg-input/60 border border-border rounded-lg p-2.5">
            <span className="text-[10px] text-text-muted block">Liquidez Táctica Neta</span>
            <strong className="text-text-primary text-sm">
              {pv(formatUsd(impact.after.freeTacticalUsdtUsd))}
            </strong>
          </div>
          <div className="bg-bg-input/60 border border-border rounded-lg p-2.5">
            <span className="text-[10px] text-text-muted block">
              Cupo Máximo Diario ({sanitizedDraft.tier3MaxFreeUsdtPct}%)
            </span>
            <strong className="text-accent-gold text-sm">
              {pv(formatUsd(impact.after.dailyCapUsd))}
            </strong>
          </div>
        </div>
      </div>

      {/* 2. Collapsible Advanced View */}
      <div className="border-t border-border pt-3 space-y-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-bg-input/60 border border-border text-xs font-semibold text-text-primary hover:border-accent-blue cursor-pointer"
        >
          <span>Vista Avanzada · Editar todos los parámetros del motor</span>
          {showAdvanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {showAdvanced && (
          <div className="space-y-4 pt-1">
            {/* Blocks & Liquidity */}
            <div className="space-y-2">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Bloques por Nivel y Límites de Liquidez
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                <ParamField
                  label="Bloque Nivel 1 ($)"
                  value={sanitizedDraft.tier1Usd}
                  min={0}
                  step={5}
                  tooltip="Cupo fijo para caídas iniciales (Nivel 1)."
                  helpText="Tope en retrocesos leves. Subirlo acelera entradas tempranas; bajarlo guarda pólvora para caídas mayores."
                  onChange={(v) => patchDraft({ tier1Usd: v }, true)}
                />
                <ParamField
                  label="Bloque Nivel 2 ($)"
                  value={sanitizedDraft.tier2Usd}
                  min={0}
                  step={5}
                  tooltip="Cupo fijo para correcciones intermedias (Nivel 2)."
                  helpText="Tope en correcciones medias. Subirlo mejora promedio en dips medios; bajarlo reduce exposición por orden."
                  onChange={(v) => patchDraft({ tier2Usd: v }, true)}
                />
                <ParamField
                  label="Bloque Nivel 3 ($)"
                  value={sanitizedDraft.tier3Usd}
                  min={0}
                  step={5}
                  tooltip="Cupo fijo para caídas profundas (Nivel 3)."
                  helpText="Máximo por activo en desplomes fuertes. Subirlo exige mayor liquidez neta disponible."
                  onChange={(v) => patchDraft({ tier3Usd: v }, true)}
                />
                <ParamField
                  label="Cupo Máximo Diario (%)"
                  value={sanitizedDraft.tier3MaxFreeUsdtPct}
                  min={1}
                  max={100}
                  step={5}
                  tooltip="Porcentaje de tu Liquidez Táctica Neta utilizable en un mismo día."
                  helpText="Porcentaje del USDT neto gastable hoy. Subirlo acelera despliegue; bajarlo estira la caja más días."
                  onChange={(v) => patchDraft({ tier3MaxFreeUsdtPct: v }, true)}
                />
                <ParamField
                  label="Piso mínimo / orden ($)"
                  value={sanitizedDraft.minOrderUsd ?? 20}
                  min={0}
                  step={5}
                  tooltip="Monto mínimo para emitir una señal con cupo."
                  helpText="Descarta señales menores a este monto para evitar micro-órdenes. Bajarlo permite fraccionar más."
                  onChange={(v) => patchDraft({ minOrderUsd: v }, true)}
                />
              </div>
            </div>

            {/* Cooldowns & Balance */}
            <div className="space-y-2">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Frenos Temporales, Multi-Moneda y Sobrepeso
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <ParamField
                  label="Cooldown temporal (horas)"
                  value={sanitizedDraft.temporalCooldownHours ?? 48}
                  min={0}
                  max={720}
                  step={6}
                  tooltip="Horas de espera obligatoria tras operar el mismo activo."
                  helpText="Ventana tras una compra táctica (0 desactiva). Subirlo frena sobrecompras; bajarlo habilita reentradas rápidas."
                  onChange={(v) => patchDraft({ temporalCooldownHours: v }, true)}
                />
                <ParamField
                  label="Tope multi-moneda 1er activo (%)"
                  value={sanitizedDraft.multiAssetFirstPassMaxSharePct ?? 60}
                  min={10}
                  max={100}
                  step={5}
                  tooltip="Máximo del cupo diario para el líder cuando >=2 activos activan señal."
                  helpText="Reparto en primera pasada multi-activo. Subirlo concentra en el #1; bajarlo distribuye más equitativo."
                  onChange={(v) => patchDraft({ multiAssetFirstPassMaxSharePct: v }, true)}
                />
                <ParamField
                  label="Tolerancia sobrepeso grupo (+%)"
                  value={sanitizedDraft.groupOverweightThresholdPct ?? 5}
                  min={0}
                  max={100}
                  step={1}
                  tooltip="Desviación sobre la meta del grupo antes de recortar su bloque al 50%."
                  helpText="Exceso permitido sobre el peso objetivo. Subirlo tolera mayor concentración antes de frenar el 50%."
                  onChange={(v) => patchDraft({ groupOverweightThresholdPct: v }, true)}
                />
              </div>
            </div>

            {/* Crypto Profile */}
            <div className="space-y-2">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Perfil Crypto (BTC, ETH, SOL, Altcoins)
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                <ParamField
                  label="Umbral N1 Crypto (%)"
                  value={sanitizedDraft.cryptoTier1MinDropPct ?? 10}
                  min={1}
                  max={95}
                  step={1}
                  tooltip="Caída mínima vs DCA para clasificar en Nivel 1 Crypto."
                  helpText="Descuento vs DCA para N1. Bajarlo activa antes; subirlo exige corrección más clara."
                  onChange={(v) => patchDraft({ cryptoTier1MinDropPct: v }, true)}
                />
                <ParamField
                  label="Umbral N2 Crypto (%)"
                  value={sanitizedDraft.cryptoTier2MinDropPct ?? 15}
                  min={1}
                  max={95}
                  step={1}
                  tooltip="Caída mínima vs DCA para clasificar en Nivel 2 Crypto."
                  helpText="Descuento vs DCA para bloque N2. Subirlo reserva el bloque N2 para caídas más severas."
                  onChange={(v) => patchDraft({ cryptoTier2MinDropPct: v }, true)}
                />
                <ParamField
                  label="Umbral N3 Crypto (%)"
                  value={sanitizedDraft.cryptoTier3MinDropPct ?? 22}
                  min={1}
                  max={95}
                  step={1}
                  tooltip="Caída mínima vs DCA para clasificar en Nivel 3 Crypto."
                  helpText="Descuento profundo para desbloquear N3. Subirlo guarda el cupo máximo para capitulaciones."
                  onChange={(v) => patchDraft({ cryptoTier3MinDropPct: v }, true)}
                />
                <ParamField
                  label="Espaciado extra Crypto (%)"
                  value={sanitizedDraft.cooldownAdditionalDropPct}
                  min={0}
                  max={90}
                  step={0.5}
                  tooltip="Caída adicional mínima bajo tu última compra antes de repetir señal."
                  helpText="Distancia extra vs tu última compra. Subirlo evita disparar seguido en caídas graduales."
                  onChange={(v) => patchDraft({ cooldownAdditionalDropPct: v }, true)}
                />
                <ParamField
                  label="Escape Flash Crash Core (%)"
                  value={sanitizedDraft.tier3EscapeDropPct ?? 15}
                  min={1}
                  max={90}
                  step={1}
                  tooltip="Caída súbita que rompe el cooldown 48h en Core y el bloqueo N3."
                  helpText="Descuento fuerte para romper 48h en BTC/ETH/SOL. Bajarlo desbloquea ante caídas menores."
                  onChange={(v) => patchDraft({ tier3EscapeDropPct: v }, true)}
                />
              </div>
            </div>

            {/* Defensive Gold Profile */}
            <div className="space-y-2">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-accent-gold">
                Perfil Defensivo Oro (PAXG / XAUT)
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                <ParamField
                  label="Umbral N1 Oro (%)"
                  value={sanitizedDraft.goldTier1MinDropPct ?? 5}
                  min={1}
                  max={95}
                  step={0.5}
                  accent="gold"
                  tooltip="Caída mínima vs DCA para clasificar en Nivel 1 Oro."
                  helpText="Descuento en oro para N1. Al ser menos volátil, tolera escalones más estrechos."
                  onChange={(v) => patchDraft({ goldTier1MinDropPct: v }, true)}
                />
                <ParamField
                  label="Umbral N2 Oro (%)"
                  value={sanitizedDraft.goldTier2MinDropPct ?? 8}
                  min={1}
                  max={95}
                  step={0.5}
                  accent="gold"
                  tooltip="Caída mínima vs DCA para clasificar en Nivel 2 Oro."
                  helpText="Descuento vs DCA para bloque N2 en PAXG/XAUT. Subirlo filtra ruido diario del oro."
                  onChange={(v) => patchDraft({ goldTier2MinDropPct: v }, true)}
                />
                <ParamField
                  label="Umbral N3 Oro (%)"
                  value={sanitizedDraft.goldTier3MinDropPct ?? 12}
                  min={1}
                  max={95}
                  step={0.5}
                  accent="gold"
                  tooltip="Caída mínima vs DCA para clasificar en Nivel 3 Oro."
                  helpText="Descuento severo para activar bloque N3 en activos respaldados en oro."
                  onChange={(v) => patchDraft({ goldTier3MinDropPct: v }, true)}
                />
                <ParamField
                  label="Espaciado extra Oro (%)"
                  value={sanitizedDraft.goldCooldownAdditionalDropPct ?? 3.5}
                  min={0}
                  max={50}
                  step={0.5}
                  accent="gold"
                  tooltip="Caída adicional bajo tu última compra de oro para desbloquear siguiente nivel."
                  helpText="Distancia extra vs última compra PAXG. Subirlo espacia entradas; bajarlo acerca recompras."
                  onChange={(v) => patchDraft({ goldCooldownAdditionalDropPct: v }, true)}
                />
                <ParamField
                  label="Escape Flash Crash Oro (%)"
                  value={sanitizedDraft.goldTier3EscapeDropPct ?? 8}
                  min={1}
                  max={90}
                  step={0.5}
                  accent="gold"
                  tooltip="Caída rápida que rompe las 48h o N3 en Oro Defensivo."
                  helpText="Descuento extraordinario para reactivar PAXG sin esperar rebote ni fin de 48h."
                  onChange={(v) => patchDraft({ goldTier3EscapeDropPct: v }, true)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Live Before vs. After Impact Preview */}
      <div className="border-t border-border pt-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Comparativa de Impacto en Vivo (Antes vs. Después)
          </h5>
          <span className="text-[10px] text-text-muted">
            Simulado con tus saldos reales y precios actuales
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="bg-bg-input/50 border border-border rounded-lg p-2.5 space-y-0.5">
            <span className="text-[10px] text-text-muted block">Cupo Máximo Diario</span>
            <div className="flex items-center gap-1.5 font-semibold">
              <span className="text-text-muted">{pv(formatUsd(impact.before.dailyCapUsd))}</span>
              <ArrowRight size={12} className="text-text-muted shrink-0" />
              <span className="text-accent-gold">{pv(formatUsd(impact.after.dailyCapUsd))}</span>
              {Math.abs(impact.dailyCapDeltaUsd) >= 0.01 && (
                <span className="text-[10px] text-text-muted">
                  ({pv(formatSignedDelta(impact.dailyCapDeltaUsd))})
                </span>
              )}
            </div>
          </div>

          <div className="bg-bg-input/50 border border-border rounded-lg p-2.5 space-y-0.5">
            <span className="text-[10px] text-text-muted block">Cupo asignado hoy</span>
            <div className="flex items-center gap-1.5 font-semibold">
              <span className="text-text-muted">
                {pv(formatUsd(impact.before.totalSuggestedBuyTodayUsd))}
              </span>
              <ArrowRight size={12} className="text-text-muted shrink-0" />
              <span className="text-accent-blue">
                {pv(formatUsd(impact.after.totalSuggestedBuyTodayUsd))}
              </span>
              {Math.abs(impact.totalBuyDeltaUsd) >= 0.01 && (
                <span className="text-[10px] text-text-muted">
                  ({pv(formatSignedDelta(impact.totalBuyDeltaUsd))})
                </span>
              )}
            </div>
          </div>

          <div className="bg-bg-input/50 border border-border rounded-lg p-2.5 space-y-0.5">
            <span className="text-[10px] text-text-muted block">
              Liquidez viva hoy tras operar
            </span>
            <div className="flex items-center gap-1.5 font-semibold">
              <span className="text-text-muted">
                {pv(formatUsd(impact.before.remainingLiquidityAfterOpsUsd))}
              </span>
              <ArrowRight size={12} className="text-text-muted shrink-0" />
              <span className="text-accent-green">
                {pv(formatUsd(impact.after.remainingLiquidityAfterOpsUsd))}
              </span>
            </div>
          </div>
        </div>

        {impact.changedAssets.length > 0 ? (
          <div className="bg-bg-input/30 border border-border rounded-lg p-2.5 space-y-1.5">
            <span className="text-[10px] font-semibold text-text-muted block">
              Cómo cambiaría el cupo según tus reglas hoy:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
              {impact.changedAssets.map((item) => (
                <div
                  key={item.ticker}
                  className="flex items-center justify-between gap-2 bg-bg-card/60 border border-border/60 rounded px-2.5 py-1.5"
                >
                  <strong className="text-text-primary shrink-0">{pv(item.ticker)}</strong>
                  <span className="text-text-muted truncate text-right">
                    {pv(formatUsd(item.beforeUsd))}{' '}
                    <span className="mx-1 text-text-muted/60">→</span>{' '}
                    <strong className="text-accent-gold">{pv(formatUsd(item.afterUsd))}</strong>
                    {item.afterUsd === 0 && item.afterStatus !== 'WATCH' && (
                      <span className="ml-1 text-[10px] opacity-80">({item.afterStatus})</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-text-muted">
            Ningún activo activo está en zona BUY o cambia de cupo asignado hoy con los precios actuales.
          </p>
        )}
      </div>

      {/* 4. Save / Confirm Actions + Conscious Red Zone Guardrail */}
      <div className="border-t border-border pt-3 space-y-2.5">
        {pendingRedConfirm && risk.level === 'red' && (
          <div className="bg-accent-red/15 border border-accent-red/50 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="text-text-primary font-medium flex items-center gap-1.5">
              <ShieldAlert size={15} className="text-accent-red shrink-0" />
              <span>
                Esta configuración está en Zona Roja respecto a tus frenos estándar de liquidez.
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={commitSave}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-red text-white hover:bg-accent-red/90 cursor-pointer"
              >
                Entiendo que estoy reduciendo los frenos estándar de liquidez, guardar de todos modos
              </button>
              <button
                type="button"
                onClick={() => setPendingRedConfirm(false)}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-text-muted">
            {justSaved && !isDirty ? (
              <span className="text-accent-green font-medium flex items-center gap-1">
                <Check size={13} /> Configuración aplicada al motor táctico.
              </span>
            ) : isDirty ? (
              <span className="text-accent-gold font-medium">
                Tienes cambios sin guardar en el borrador.
              </span>
            ) : (
              <span>Configuración sincronizada con el motor activo.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                type="button"
                onClick={() => {
                  setDraft(cleanSaved);
                  setPendingRedConfirm(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
              >
                Descartar cambios
              </button>
            )}
            <button
              type="button"
              onClick={handleRequestSave}
              disabled={!isDirty && justSaved}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-accent-blue text-white hover:bg-accent-blue/90 disabled:opacity-50 cursor-pointer"
            >
              <Check size={13} />
              <span>Guardar configuración</span>
            </button>
          </div>
        </div>

        {/* 5. Discreet Disclaimer Footer */}
        <p className="text-[10px] text-text-muted/80 leading-snug pt-1">
          Los cálculos de este módulo son automáticos según tus propios parámetros de gestión de liquidez y no constituyen asesoría financiera ni recomendaciones de inversión.
        </p>
      </div>
    </div>
  );
}
