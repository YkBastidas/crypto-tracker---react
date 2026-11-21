import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Link2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  StickyNote,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { usePortfolioStore } from '../../../shared/store/portfolioStore';
import { PrivacyValue } from '../../../shared/ui/PrivacyValue';
import { ENVELOPE_META } from '../data/defaultSeed';
import { useBudgetStore } from '../store/budgetStore';
import type {
  EnvelopeId,
  SharedSubscription,
  SharedSubscriptionFrequency,
  SharedSubscriptionMember,
} from '../types';
import {
  calculateDaysLeft,
  computeSharedSubscriptionSummary,
  formatBs,
  formatUsd,
  getPaymentMethodLabel,
  suggestNextCycleLabel,
} from '../utils/calculations';
import { RecordSharedPaymentModal } from './RecordSharedPaymentModal';

function defaultCycleLabelForFrequency(freq: SharedSubscriptionFrequency): string {
  const now = new Date();
  if (freq === 'anual') return String(now.getFullYear());
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function SharedSubscriptionsSection() {
  const isPrivate = usePortfolioStore((s) => s.isPrivate);
  const {
    sharedSubscriptions,
    expenses,
    customAccounts,
    nativeAccountOverrides,
    addSharedSubscription,
    updateSharedSubscription,
    removeSharedSubscription,
    advanceSharedSubscriptionCycle,
    recordSharedSubscriptionPayment,
    updateSharedSubscriptionPayment,
    removeSharedSubscriptionPayment,
  } = useBudgetStore();

  // Create/Edit subscription form state
  const [showForm, setShowForm] = useState(false);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [subName, setSubName] = useState('');
  const [subTotal, setSubTotal] = useState('');
  const [subFreq, setSubFreq] = useState<SharedSubscriptionFrequency>('anual');
  const [subCycleLabel, setSubCycleLabel] = useState(() => defaultCycleLabelForFrequency('anual'));
  const [subRenewalDate, setSubRenewalDate] = useState('');
  const [subLinkedExpenseId, setSubLinkedExpenseId] = useState('');
  const [subDefaultEnv, setSubDefaultEnv] = useState<EnvelopeId>('provisiones_anuales');
  const [subIncludesMe, setSubIncludesMe] = useState(true);
  const [subNotes, setSubNotes] = useState('');
  const [membersDraft, setMembersDraft] = useState<SharedSubscriptionMember[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberCustom, setNewMemberCustom] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Per-card interactive state
  const [collectingTarget, setCollectingTarget] = useState<{
    subscriptionId: string;
    memberId: string;
  } | null>(null);
  const [renewingSubId, setRenewingSubId] = useState<string | null>(null);
  const [nextCycleInput, setNextCycleInput] = useState('');
  const [advanceRenewalCheck, setAdvanceRenewalCheck] = useState(true);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});
  const [addingHistSubId, setAddingHistSubId] = useState<string | null>(null);
  const [histMemberId, setHistMemberId] = useState('');
  const [histCycleLabel, setHistCycleLabel] = useState('');
  const [histDate, setHistDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [histAmount, setHistAmount] = useState('');
  const [histNotes, setHistNotes] = useState('');
  const [histKind, setHistKind] = useState<'historical' | 'in_kind'>('historical');
  const [editingPayTarget, setEditingPayTarget] = useState<{
    subscriptionId: string;
    paymentId: string;
    isOffLedger: boolean;
  } | null>(null);
  const [editPayDate, setEditPayDate] = useState('');
  const [editPayAmount, setEditPayAmount] = useState('');
  const [editPayCycle, setEditPayCycle] = useState('');
  const [editPayNotes, setEditPayNotes] = useState('');
  const [editPayKind, setEditPayKind] = useState<'historical' | 'in_kind'>('historical');

  const formPreview = useMemo(() => {
    const parsedTotal = parseFloat(subTotal) || 0;
    return computeSharedSubscriptionSummary({
      id: 'preview',
      name: subName || 'Preview',
      totalAmountUsd: Math.max(0, parsedTotal),
      frequency: subFreq,
      includesMe: subIncludesMe,
      currentCycleLabel: subCycleLabel || '2026',
      members: membersDraft,
      payments: [],
    });
  }, [subTotal, subName, subFreq, subIncludesMe, subCycleLabel, membersDraft]);

  const collectingModalData = useMemo(() => {
    if (!collectingTarget) return null;
    const sub = sharedSubscriptions.find((s) => s.id === collectingTarget.subscriptionId);
    if (!sub) return null;
    const summary = computeSharedSubscriptionSummary(sub);
    const member = summary.members.find((m) => m.id === collectingTarget.memberId);
    if (!member) return null;
    return { subscription: sub, member };
  }, [collectingTarget, sharedSubscriptions]);

  const resetForm = () => {
    setEditingSubId(null);
    setSubName('');
    setSubTotal('');
    setSubFreq('anual');
    setSubCycleLabel(defaultCycleLabelForFrequency('anual'));
    setSubRenewalDate('');
    setSubLinkedExpenseId('');
    setSubDefaultEnv('provisiones_anuales');
    setSubIncludesMe(true);
    setSubNotes('');
    setMembersDraft([]);
    setNewMemberName('');
    setNewMemberCustom('');
    setFormError(null);
  };

  const startEditSubscription = (sub: SharedSubscription) => {
    setEditingSubId(sub.id);
    setSubName(sub.name);
    setSubTotal(String(sub.totalAmountUsd));
    setSubFreq(sub.frequency);
    setSubCycleLabel(sub.currentCycleLabel);
    setSubRenewalDate(sub.nextRenewalDate ?? '');
    setSubLinkedExpenseId(sub.linkedExpenseId ?? '');
    setSubDefaultEnv(
      sub.defaultEnvelopeId ??
        (sub.frequency === 'anual' ? 'provisiones_anuales' : 'ahorro_inversion'),
    );
    setSubIncludesMe(sub.includesMe);
    setSubNotes(sub.notes ?? '');
    setMembersDraft(sub.members.map((m) => ({ ...m })));
    setNewMemberName('');
    setNewMemberCustom('');
    setFormError(null);
    setShowForm(true);
  };

  const handleAddMemberToDraft = () => {
    const cleanName = newMemberName.trim();
    if (!cleanName) return;
    const parsedCustom = newMemberCustom.trim() ? parseFloat(newMemberCustom) : null;
    const newMember: SharedSubscriptionMember = {
      id: `subm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      customShareUsd:
        parsedCustom !== null && Number.isFinite(parsedCustom) && parsedCustom >= 0
          ? Number(parsedCustom.toFixed(2))
          : null,
    };
    setMembersDraft((prev) => [...prev, newMember]);
    setNewMemberName('');
    setNewMemberCustom('');
    setFormError(null);
  };

  const handleLinkedExpenseChange = (expId: string) => {
    setSubLinkedExpenseId(expId);
    if (!expId) return;
    const exp = expenses.find((e) => e.id === expId);
    if (!exp) return;

    setSubDefaultEnv(exp.frequency === 'anual' ? 'provisiones_anuales' : exp.envelopeId);
    if (!subName.trim()) setSubName(exp.name);
    if (!subTotal.trim()) setSubTotal(String(exp.amountUsd));
    if (!editingSubId) {
      setSubFreq(exp.frequency);
      setSubCycleLabel(defaultCycleLabelForFrequency(exp.frequency));
      setSubRenewalDate(exp.nextDueDate);
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(subTotal);
    if (!subName.trim() || !Number.isFinite(total) || total <= 0) {
      setFormError('Ingresa un nombre válido y un costo total mayor a $0.');
      return;
    }

    let nextMembers = membersDraft.map((m) => ({
      ...m,
      name: m.name.trim() || 'Miembro',
    }));
    if (newMemberName.trim()) {
      const parsedCustom = newMemberCustom.trim() ? parseFloat(newMemberCustom) : null;
      nextMembers = [
        ...nextMembers,
        {
          id: `subm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: newMemberName.trim(),
          customShareUsd:
            parsedCustom !== null && Number.isFinite(parsedCustom) && parsedCustom >= 0
              ? Number(parsedCustom.toFixed(2))
              : null,
        },
      ];
    }

    if (nextMembers.length === 0) {
      setFormError('Agrega al menos 1 participante que te deba parte de esta suscripción.');
      return;
    }

    const cleanCycle = subCycleLabel.trim() || defaultCycleLabelForFrequency(subFreq);

    if (editingSubId) {
      updateSharedSubscription(editingSubId, {
        name: subName.trim(),
        totalAmountUsd: Number(total.toFixed(2)),
        frequency: subFreq,
        includesMe: subIncludesMe,
        currentCycleLabel: cleanCycle,
        nextRenewalDate: subRenewalDate.trim() || undefined,
        linkedExpenseId: subLinkedExpenseId || undefined,
        defaultEnvelopeId: subDefaultEnv,
        members: nextMembers,
        notes: subNotes.trim() || undefined,
      });
    } else {
      addSharedSubscription({
        name: subName.trim(),
        totalAmountUsd: Number(total.toFixed(2)),
        frequency: subFreq,
        includesMe: subIncludesMe,
        currentCycleLabel: cleanCycle,
        nextRenewalDate: subRenewalDate.trim() || undefined,
        linkedExpenseId: subLinkedExpenseId || undefined,
        defaultEnvelopeId: subDefaultEnv,
        members: nextMembers,
        payments: [],
        notes: subNotes.trim() || undefined,
      });
    }

    resetForm();
    setShowForm(false);
  };

  return (
    <div className="border-t border-border/70 pt-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Users size={16} className="text-accent-blue" /> Suscripciones y Gastos Compartidos
          </h3>
          <p className="text-xs text-text-muted">
            Divide una suscripción anual o mensual entre varios miembros con cuota automática
            (Total ÷ N) y ajustes opcionales por persona.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (showForm && editingSubId) {
              resetForm();
              return;
            }
            if (!showForm) resetForm();
            setShowForm((v) => !v);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-blue/15 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/25 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Plus size={14} /> Nueva Suscripción
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmitForm}
          className="bg-bg-input/60 border border-border rounded-xl p-4 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-text-primary uppercase tracking-wide">
              {editingSubId ? 'Editar Suscripción Compartida' : 'Nueva Suscripción Compartida'}
            </h4>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="text-xs text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div className="lg:col-span-2">
              <label className="text-[11px] text-text-muted block mb-1">Servicio / Concepto</label>
              <input
                type="text"
                required
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Ej. Spotify Familiar"
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>

            <div>
              <label className="text-[11px] text-text-muted block mb-1">Costo Total (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={subTotal}
                onChange={(e) => setSubTotal(e.target.value)}
                placeholder="139.20"
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>

            <div>
              <label className="text-[11px] text-text-muted block mb-1">Frecuencia</label>
              <select
                value={subFreq}
                onChange={(e) => {
                  const nextFreq = e.target.value as SharedSubscriptionFrequency;
                  setSubFreq(nextFreq);
                  if (!editingSubId) {
                    setSubCycleLabel(defaultCycleLabelForFrequency(nextFreq));
                  }
                }}
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              >
                <option value="anual">Anual</option>
                <option value="mensual">Mensual</option>
                <option value="quincenal">Quincenal</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-text-muted block mb-1">Ciclo actual</label>
              <input
                type="text"
                required
                value={subCycleLabel}
                onChange={(e) => setSubCycleLabel(e.target.value)}
                placeholder="2026"
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              />
            </div>

            <div>
              <label className="text-[11px] text-text-muted block mb-1">Próx. renovación (opc.)</label>
              <input
                type="date"
                value={subRenewalDate}
                onChange={(e) => setSubRenewalDate(e.target.value)}
                className="w-full px-2 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-[11px] text-text-muted block mb-1">
                Vincular a gasto recurrente (opc.)
              </label>
              <select
                value={subLinkedExpenseId}
                onChange={(e) => handleLinkedExpenseChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              >
                <option value="">Sin vínculo</option>
                {expenses.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.name} ({formatUsd(exp.amountUsd)} / {exp.frequency})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-text-muted block mb-1">Sobre sugerido al cobrar</label>
              <select
                value={subDefaultEnv}
                onChange={(e) => setSubDefaultEnv(e.target.value as EnvelopeId)}
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              >
                {(Object.keys(ENVELOPE_META) as EnvelopeId[]).map((id) => (
                  <option key={id} value={id}>
                    {ENVELOPE_META[id].name}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="text-[11px] text-text-muted block mb-1">Notas (opc.)</label>
              <input
                type="text"
                value={subNotes}
                onChange={(e) => setSubNotes(e.target.value)}
                placeholder="Ej. Plan Familiar pagado con Binance / tarjeta"
                className="w-full px-3 py-2 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={subIncludesMe}
              onChange={(e) => setSubIncludesMe(e.target.checked)}
              className="w-4 h-4 accent-accent-blue cursor-pointer"
            />
            <span>Incluirme en la división (dividir Total entre miembros + yo)</span>
          </label>

          {/* Dynamic Participants Builder */}
          <div className="bg-bg-card/70 border border-border rounded-xl p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-primary">
                Participantes que me pagan ({membersDraft.length})
              </span>
              <span className="text-[11px] text-text-muted">
                Entre {formPreview.participantCount} ({membersDraft.length}
                {subIncludesMe ? ' + tú' : ''}) · Cuota base:{' '}
                <strong className="text-accent-blue">
                  <PrivacyValue value={formatUsd(formPreview.defaultShareUsd)} isPrivate={isPrivate} />
                </strong>{' '}
                c/u
                {subIncludesMe && (
                  <>
                    {' '}
                    · Tu parte neta:{' '}
                    <strong className="text-text-primary">
                      <PrivacyValue value={formatUsd(formPreview.myShareUsd)} isPrivate={isPrivate} />
                    </strong>
                  </>
                )}{' '}
                · Por cobrar:{' '}
                <strong className="text-accent-green">
                  <PrivacyValue
                    value={formatUsd(formPreview.totalReceivableUsd)}
                    isPrivate={isPrivate}
                  />
                </strong>
              </span>
            </div>

            {membersDraft.length > 0 && (
              <div className="space-y-1.5">
                {membersDraft.map((m, idx) => {
                  const isCustom =
                    typeof m.customShareUsd === 'number' && Number.isFinite(m.customShareUsd);
                  return (
                    <div
                      key={m.id}
                      className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-bg-input/60 border border-border/70 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="text-[10px] font-mono text-text-muted w-5">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={m.name}
                        onChange={(e) =>
                          setMembersDraft((prev) =>
                            prev.map((item) =>
                              item.id === m.id ? { ...item, name: e.target.value } : item,
                            ),
                          )
                        }
                        placeholder="Nombre"
                        className="flex-1 min-w-32 px-2 py-1 rounded text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={isCustom ? String(m.customShareUsd) : ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const num = raw.trim() === '' ? null : parseFloat(raw);
                            setMembersDraft((prev) =>
                              prev.map((item) =>
                                item.id === m.id
                                  ? {
                                      ...item,
                                      customShareUsd:
                                        num !== null && Number.isFinite(num) && num >= 0
                                          ? num
                                          : null,
                                    }
                                  : item,
                              ),
                            );
                          }}
                          placeholder={`Auto (${formatUsd(formPreview.defaultShareUsd)})`}
                          className="w-32 px-2 py-1 rounded text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                        />
                        {isCustom && (
                          <button
                            type="button"
                            title="Volver a cuota automática (Total ÷ N)"
                            onClick={() =>
                              setMembersDraft((prev) =>
                                prev.map((item) =>
                                  item.id === m.id ? { ...item, customShareUsd: null } : item,
                                ),
                              )
                            }
                            className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[10px] bg-bg-card border border-border text-text-muted hover:text-accent-blue cursor-pointer"
                          >
                            <RotateCcw size={10} /> Auto
                          </button>
                        )}
                        <button
                          type="button"
                          title="Quitar participante"
                          onClick={() =>
                            setMembersDraft((prev) => prev.filter((item) => item.id !== m.id))
                          }
                          className="p-1 text-text-muted hover:text-accent-red bg-transparent border-none cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMemberToDraft();
                  }
                }}
                placeholder="Agregar persona (ej. Carlos, Hermano...)"
                className="flex-1 min-w-44 px-3 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={newMemberCustom}
                onChange={(e) => setNewMemberCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMemberToDraft();
                  }
                }}
                placeholder="Cuota $ (opc.)"
                className="w-32 px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
              <button
                type="button"
                onClick={handleAddMemberToDraft}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-blue/20 border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/30 cursor-pointer"
              >
                <Plus size={13} /> Agregar
              </button>
            </div>
          </div>

          {formError && <p className="text-xs text-accent-red font-medium">{formError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-accent-blue text-white border-none cursor-pointer"
            >
              <Check size={14} /> {editingSubId ? 'Guardar Cambios' : 'Crear Suscripción'}
            </button>
          </div>
        </form>
      )}

      {sharedSubscriptions.length === 0 ? (
        <div className="bg-bg-input/30 border border-dashed border-border rounded-xl p-4 text-xs text-text-muted flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            No tienes suscripciones compartidas aún. Ejemplo: <strong className="text-text-primary">Spotify Familiar ($139.20/año)</strong> entre 5 personas + tú → <strong className="text-accent-green">$23.20 c/u</strong> en una sola tarjeta con estado por miembro.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sharedSubscriptions.map((sub) => {
            const summary = computeSharedSubscriptionSummary(sub);
            const linkedExpense = sub.linkedExpenseId
              ? expenses.find((e) => e.id === sub.linkedExpenseId)
              : undefined;
            const renewalDaysLeft = sub.nextRenewalDate
              ? calculateDaysLeft(sub.nextRenewalDate)
              : null;
            const isRenewing = renewingSubId === sub.id;
            const isHistoryExpanded = Boolean(expandedHistoryIds[sub.id]);
            const isAddingHist = addingHistSubId === sub.id;
            const sortedPayments = [...sub.payments].sort((a, b) =>
              b.date.localeCompare(a.date),
            );

            return (
              <div
                key={sub.id}
                className="bg-bg-input/40 border border-border rounded-xl p-4 space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Users size={15} className="text-accent-blue" />
                      <h4 className="text-sm font-bold text-text-primary">{sub.name}</h4>
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-bg-input text-text-muted">
                        {sub.frequency}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-blue/15 text-accent-blue">
                        Ciclo {sub.currentCycleLabel}
                      </span>
                      {renewalDaysLeft !== null && (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            renewalDaysLeft < 0
                              ? 'bg-accent-red/15 text-accent-red'
                              : renewalDaysLeft <= 15
                                ? 'bg-accent-gold/20 text-accent-gold'
                                : 'bg-bg-input text-text-muted'
                          }`}
                        >
                          {renewalDaysLeft < 0
                            ? `Renovación vencida ${Math.abs(renewalDaysLeft)}d`
                            : renewalDaysLeft === 0
                              ? 'Renueva hoy'
                              : `Renueva en ${renewalDaysLeft}d`}
                        </span>
                      )}
                      {linkedExpense && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent-green/10 border border-accent-green/25 text-accent-green">
                          <Link2 size={10} /> {linkedExpense.name}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-text-muted">
                      Total:{' '}
                      <strong className="text-text-primary">
                        <PrivacyValue value={formatUsd(sub.totalAmountUsd)} isPrivate={isPrivate} />
                      </strong>{' '}
                      / {sub.frequency} · Cuota base:{' '}
                      <strong className="text-accent-blue">
                        <PrivacyValue
                          value={formatUsd(summary.defaultShareUsd)}
                          isPrivate={isPrivate}
                        />
                      </strong>{' '}
                      (entre {summary.participantCount}
                      {sub.includesMe ? `: ${sub.members.length} + tú` : ''})
                      {sub.includesMe && (
                        <>
                          {' '}
                          · Tu parte:{' '}
                          <strong className="text-text-primary">
                            <PrivacyValue value={formatUsd(summary.myShareUsd)} isPrivate={isPrivate} />
                          </strong>
                        </>
                      )}
                    </p>
                    {sub.notes && <p className="text-[11px] text-text-muted/80">{sub.notes}</p>}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Iniciar nuevo ciclo"
                      onClick={() => {
                        if (isRenewing) {
                          setRenewingSubId(null);
                          return;
                        }
                        setRenewingSubId(sub.id);
                        setNextCycleInput(
                          suggestNextCycleLabel(sub.currentCycleLabel, sub.frequency),
                        );
                        setAdvanceRenewalCheck(Boolean(sub.nextRenewalDate));
                      }}
                      className={`p-1 bg-transparent border-none cursor-pointer ${
                        isRenewing ? 'text-accent-blue' : 'text-text-muted hover:text-accent-blue'
                      }`}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      type="button"
                      title="Editar suscripción"
                      onClick={() => startEditSubscription(sub)}
                      className="p-1 text-text-muted hover:text-accent-blue bg-transparent border-none cursor-pointer"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="Eliminar suscripción"
                      onClick={() => removeSharedSubscription(sub.id)}
                      className="p-1 text-text-muted hover:text-accent-red bg-transparent border-none cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {summary.overAllocatedUsd > 0.01 && (
                  <p className="text-[11px] text-accent-gold bg-accent-gold/10 border border-accent-gold/30 rounded-lg px-2.5 py-1.5">
                    Las cuotas personalizadas suman{' '}
                    <PrivacyValue value={formatUsd(summary.overAllocatedUsd)} isPrivate={isPrivate} />{' '}
                    por encima del costo total del servicio.
                  </p>
                )}

                {isRenewing && (
                  <div className="bg-accent-blue/10 border border-accent-blue/35 rounded-xl p-2.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-accent-blue">
                        Abrir nuevo ciclo (conserva el historial anterior):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={nextCycleInput}
                          onChange={(e) => setNextCycleInput(e.target.value)}
                          placeholder="Ej. 2027"
                          className="w-28 px-2 py-1 rounded text-xs bg-bg-input border border-border text-text-primary focus:outline-none focus:border-accent-blue"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!nextCycleInput.trim()) return;
                            advanceSharedSubscriptionCycle(
                              sub.id,
                              nextCycleInput,
                              advanceRenewalCheck,
                            );
                            setRenewingSubId(null);
                          }}
                          className="px-2.5 py-1 rounded text-[11px] font-bold bg-accent-blue text-white border-none cursor-pointer"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenewingSubId(null)}
                          className="px-2 py-1 rounded text-[11px] bg-bg-input text-text-muted border border-border cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                    {sub.nextRenewalDate && (
                      <label className="flex items-center gap-2 text-[11px] text-text-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={advanceRenewalCheck}
                          onChange={(e) => setAdvanceRenewalCheck(e.target.checked)}
                          className="w-3.5 h-3.5 accent-accent-blue cursor-pointer"
                        />
                        <span>Avanzar fecha de renovación ({sub.nextRenewalDate})</span>
                      </label>
                    )}
                  </div>
                )}

                {/* Cycle Progress Bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-muted">
                      Cobrado ({sub.currentCycleLabel}):{' '}
                      <strong className="text-text-primary">
                        <PrivacyValue
                          value={formatUsd(summary.collectedInCycleUsd)}
                          isPrivate={isPrivate}
                        />
                      </strong>
                    </span>
                    <span className="text-text-muted">
                      Meta terceros:{' '}
                      <strong className="text-text-primary">
                        <PrivacyValue
                          value={formatUsd(summary.totalReceivableUsd)}
                          isPrivate={isPrivate}
                        />
                      </strong>{' '}
                      ({summary.progressPct.toFixed(1)}%) · {summary.paidMembersCount}/
                      {summary.billableMembersCount} pagaron
                    </span>
                  </div>
                  <div className="w-full h-2 bg-bg-input rounded-full overflow-hidden border border-border">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        summary.remainingInCycleUsd <= 0.005 ? 'bg-accent-green' : 'bg-accent-blue'
                      }`}
                      style={{ width: `${summary.progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Members List */}
                <div className="divide-y divide-border/60 bg-bg-card/50 border border-border/80 rounded-xl px-3">
                  {summary.members.map((m) => (
                    <div
                      key={m.id}
                      className="py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-text-primary truncate">{m.name}</span>
                          {m.isCustomShare && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent-gold/15 text-accent-gold font-medium">
                              Personalizado
                            </span>
                          )}
                          {m.status === 'paid' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent-green/15 text-accent-green">
                              Pagado{m.lastPaidDateInCycle ? ` · ${m.lastPaidDateInCycle}` : ''}
                            </span>
                          )}
                          {m.status === 'partial' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent-gold/15 text-accent-gold">
                              Parcial (
                              <PrivacyValue
                                value={formatUsd(m.paidInCycleUsd)}
                                isPrivate={isPrivate}
                              />
                              /
                              <PrivacyValue value={formatUsd(m.shareUsd)} isPrivate={isPrivate} />)
                            </span>
                          )}
                          {m.status === 'pending' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-bg-input text-text-muted">
                              Pendiente
                            </span>
                          )}
                          {m.status === 'covered' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300">
                              Cubierto ($0)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-text-primary">
                          <PrivacyValue value={formatUsd(m.shareUsd)} isPrivate={isPrivate} />
                        </span>
                        {m.remainingInCycleUsd > 0.005 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setCollectingTarget({ subscriptionId: sub.id, memberId: m.id })
                            }
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-accent-green/15 border border-accent-green/40 text-accent-green hover:bg-accent-green/25 cursor-pointer"
                          >
                            Cobrar
                          </button>
                        ) : (
                          <span className="text-[11px] text-accent-green font-semibold px-1.5">
                            ✓
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer & History Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <span className="text-[11px] text-text-muted">
                    Resta por cobrar ({sub.currentCycleLabel}):{' '}
                    <strong className="text-text-primary">
                      <PrivacyValue
                        value={formatUsd(summary.remainingInCycleUsd)}
                        isPrivate={isPrivate}
                      />
                    </strong>
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedHistoryIds((prev) => ({ ...prev, [sub.id]: !prev[sub.id] }))
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                      isHistoryExpanded
                        ? 'bg-accent-blue/15 border-accent-blue/40 text-accent-blue'
                        : 'bg-bg-input border-border text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <History size={13} />
                    <span>Historial ({sub.payments.length})</span>
                    {isHistoryExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>

                {isHistoryExpanded && (
                  <div className="border-t border-border/70 pt-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
                      <span>Historial de cobros por miembro y ciclo</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (isAddingHist) {
                            setAddingHistSubId(null);
                            return;
                          }
                          const defaultMember = sub.members[0];
                          const memberSum = summary.members.find((m) => m.id === defaultMember?.id);
                          setAddingHistSubId(sub.id);
                          setHistMemberId(defaultMember?.id ?? '');
                          setHistCycleLabel(sub.currentCycleLabel);
                          setHistAmount(
                            String(
                              Number(
                                (memberSum?.shareUsd ?? summary.defaultShareUsd).toFixed(2),
                              ),
                            ),
                          );
                          setHistNotes('');
                          setHistKind('historical');
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border cursor-pointer transition-colors ${
                          isAddingHist
                            ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                            : 'bg-bg-input border-border text-text-primary hover:border-amber-400/50 hover:text-amber-200'
                        }`}
                      >
                        <Plus size={12} /> Pago histórico
                      </button>
                    </div>

                    {isAddingHist && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const parsed = parseFloat(histAmount);
                          if (!histMemberId || !Number.isFinite(parsed) || parsed <= 0 || !histDate) {
                            return;
                          }
                          recordSharedSubscriptionPayment(sub.id, {
                            memberId: histMemberId,
                            amountUsd: Number(parsed.toFixed(2)),
                            settlementKind: histKind,
                            date: histDate,
                            cycleLabel: histCycleLabel.trim() || sub.currentCycleLabel,
                            notes: histNotes,
                          });
                          setHistNotes('');
                        }}
                        className="bg-amber-500/5 border border-amber-400/30 rounded-xl p-3 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-amber-200">
                            Registrar cobro previo / en especie (sin tocar sobres ni cuentas)
                          </span>
                          <div className="flex rounded-lg overflow-hidden border border-border text-[10px]">
                            <button
                              type="button"
                              onClick={() => setHistKind('historical')}
                              className={`px-2 py-1 font-semibold border-none cursor-pointer ${
                                histKind === 'historical'
                                  ? 'bg-amber-500/25 text-amber-200'
                                  : 'bg-bg-input text-text-muted hover:text-text-primary'
                              }`}
                            >
                              Histórico (previo)
                            </button>
                            <button
                              type="button"
                              onClick={() => setHistKind('in_kind')}
                              className={`px-2 py-1 font-semibold border-none cursor-pointer ${
                                histKind === 'in_kind'
                                  ? 'bg-purple-500/25 text-purple-200'
                                  : 'bg-bg-input text-text-muted hover:text-text-primary'
                              }`}
                            >
                              En especie
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] text-text-muted block mb-1">Miembro</label>
                            <select
                              value={histMemberId}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                setHistMemberId(nextId);
                                const mSum = summary.members.find((m) => m.id === nextId);
                                if (mSum) setHistAmount(String(mSum.shareUsd));
                              }}
                              className="w-full px-2 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                            >
                              {sub.members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-text-muted block mb-1">Ciclo</label>
                            <input
                              type="text"
                              value={histCycleLabel}
                              onChange={(e) => setHistCycleLabel(e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-text-muted block mb-1">Fecha</label>
                            <input
                              type="date"
                              required
                              value={histDate}
                              onChange={(e) => setHistDate(e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-text-muted block mb-1">Monto ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={histAmount}
                              onChange={(e) => setHistAmount(e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg text-xs font-bold bg-bg-input border border-border text-text-primary"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={histNotes}
                            onChange={(e) => setHistNotes(e.target.value)}
                            placeholder="Nota opcional (ej. Pagó en efectivo hace meses...)"
                            className="flex-1 min-w-40 px-2.5 py-1.5 rounded-lg text-xs bg-bg-input border border-border text-text-primary"
                          />
                          <button
                            type="button"
                            onClick={() => setAddingHistSubId(null)}
                            className="px-2.5 py-1 rounded-lg text-[11px] bg-bg-input border border-border text-text-muted hover:text-text-primary cursor-pointer"
                          >
                            Cerrar
                          </button>
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 border border-amber-400/50 text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                          >
                            <Check size={12} /> Agregar
                          </button>
                        </div>
                      </form>
                    )}

                    {sortedPayments.length === 0 ? (
                      <p className="text-[11px] text-text-muted italic">
                        Aún no hay cobros registrados en esta suscripción.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {sortedPayments.map((pay) => {
                          const memberLabel =
                            sub.members.find((m) => m.id === pay.memberId)?.name ??
                            pay.memberName ??
                            'Miembro';
                          const isOffLedgerPay =
                            pay.settlementKind === 'in_kind' ||
                            pay.settlementKind === 'historical';
                          const isEditingThis =
                            editingPayTarget?.subscriptionId === sub.id &&
                            editingPayTarget?.paymentId === pay.id;

                          const custodyLabel = pay.paymentMethod
                            ? getPaymentMethodLabel(
                                pay.paymentMethod,
                                customAccounts,
                                nativeAccountOverrides,
                              )
                            : 'Sin custodia';
                          const envLabel = pay.envelopeId
                            ? (ENVELOPE_META[pay.envelopeId]?.shortName ?? pay.envelopeId)
                            : null;

                          const startEditPay = () => {
                            setEditingPayTarget({
                              subscriptionId: sub.id,
                              paymentId: pay.id,
                              isOffLedger: isOffLedgerPay,
                            });
                            setEditPayDate(pay.date);
                            setEditPayAmount(String(pay.amountUsd));
                            setEditPayCycle(pay.cycleLabel);
                            setEditPayNotes(pay.notes ?? '');
                            if (
                              pay.settlementKind === 'in_kind' ||
                              pay.settlementKind === 'historical'
                            ) {
                              setEditPayKind(pay.settlementKind);
                            }
                          };

                          const saveEditPay = () => {
                            const parsed = parseFloat(editPayAmount);
                            if (!Number.isFinite(parsed) || parsed <= 0 || !editPayDate) return;
                            updateSharedSubscriptionPayment(sub.id, pay.id, {
                              date: editPayDate,
                              amountUsd: Number(parsed.toFixed(2)),
                              cycleLabel: editPayCycle.trim() || pay.cycleLabel,
                              notes: editPayNotes,
                              ...(isOffLedgerPay ? { settlementKind: editPayKind } : {}),
                            });
                            setEditingPayTarget(null);
                          };

                          return (
                            <div
                              key={pay.id}
                              className="bg-bg-card/70 border border-border/80 rounded-lg px-2.5 py-2 space-y-1.5"
                            >
                              {isEditingThis ? (
                                <div className="space-y-2">
                                  <div
                                    className={`grid gap-2 ${
                                      isOffLedgerPay
                                        ? 'grid-cols-2 sm:grid-cols-5'
                                        : 'grid-cols-2 sm:grid-cols-4'
                                    }`}
                                  >
                                    <div>
                                      <label className="text-[10px] text-text-muted block mb-0.5">
                                        Fecha
                                      </label>
                                      <input
                                        type="date"
                                        value={editPayDate}
                                        onChange={(e) => setEditPayDate(e.target.value)}
                                        className="w-full px-2 py-1 rounded text-[11px] bg-bg-input border border-accent-blue/50 text-text-primary focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-text-muted block mb-0.5">
                                        Monto ($)
                                      </label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        value={editPayAmount}
                                        onChange={(e) => setEditPayAmount(e.target.value)}
                                        className="w-full px-2 py-1 rounded text-[11px] font-bold bg-bg-input border border-accent-blue/50 text-text-primary focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-text-muted block mb-0.5">
                                        Ciclo
                                      </label>
                                      <input
                                        type="text"
                                        value={editPayCycle}
                                        onChange={(e) => setEditPayCycle(e.target.value)}
                                        className="w-full px-2 py-1 rounded text-[11px] bg-bg-input border border-accent-blue/50 text-text-primary focus:outline-none"
                                      />
                                    </div>
                                    {isOffLedgerPay && (
                                      <div>
                                        <label className="text-[10px] text-text-muted block mb-0.5">
                                          Tipo
                                        </label>
                                        <select
                                          value={editPayKind}
                                          onChange={(e) =>
                                            setEditPayKind(
                                              e.target.value as 'historical' | 'in_kind',
                                            )
                                          }
                                          className="w-full px-2 py-1 rounded text-[11px] bg-bg-input border border-accent-blue/50 text-text-primary focus:outline-none"
                                        >
                                          <option value="historical">Histórico</option>
                                          <option value="in_kind">En especie</option>
                                        </select>
                                      </div>
                                    )}
                                    <div className="col-span-2 sm:col-span-1">
                                      <label className="text-[10px] text-text-muted block mb-0.5">
                                        Nota
                                      </label>
                                      <input
                                        type="text"
                                        value={editPayNotes}
                                        onChange={(e) => setEditPayNotes(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            saveEditPay();
                                          } else if (e.key === 'Escape') {
                                            setEditingPayTarget(null);
                                          }
                                        }}
                                        placeholder="Nota..."
                                        className="w-full px-2 py-1 rounded text-[11px] bg-bg-input border border-accent-blue/50 text-text-primary focus:outline-none"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between gap-2">
                                    {!isOffLedgerPay ? (
                                      <span className="text-[10px] text-cyan-300/90">
                                        También actualiza fecha, monto y nota en el ledger.
                                      </span>
                                    ) : (
                                      <span />
                                    )}
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setEditingPayTarget(null)}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-bg-input text-text-muted border border-border cursor-pointer"
                                      >
                                        <X size={11} /> Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={saveEditPay}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-accent-green/20 text-accent-green border border-accent-green/40 cursor-pointer"
                                      >
                                        <Check size={11} /> Guardar
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent-blue/15 text-accent-blue">
                                        {pay.cycleLabel}
                                      </span>
                                      <span className="text-xs font-semibold text-text-primary">
                                        {memberLabel}
                                      </span>
                                      <span className="text-[11px] font-mono text-text-muted">
                                        {pay.date}
                                      </span>
                                      <span className="text-xs font-bold text-text-primary">
                                        <PrivacyValue
                                          value={formatUsd(pay.amountUsd)}
                                          isPrivate={isPrivate}
                                        />
                                      </span>
                                      {typeof pay.amountBs === 'number' && pay.amountBs > 0 && (
                                        <span className="text-[10px] text-cyan-300">
                                          (
                                          <PrivacyValue
                                            value={formatBs(pay.amountBs)}
                                            isPrivate={isPrivate}
                                          />
                                          )
                                        </span>
                                      )}
                                      {pay.settlementKind === 'in_kind' ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300">
                                          <Package size={10} /> En especie · Sin cuentas
                                        </span>
                                      ) : pay.settlementKind === 'historical' ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-200">
                                          <History size={10} /> Histórico · Sin cuentas
                                        </span>
                                      ) : (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-input border border-border text-text-muted">
                                          {custodyLabel}
                                          {envLabel ? ` · ${envLabel}` : ''}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        title="Editar cobro"
                                        onClick={startEditPay}
                                        className="p-1 rounded text-text-muted hover:text-accent-blue bg-transparent border-none cursor-pointer"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        title="Eliminar cobro"
                                        onClick={() => {
                                          if (
                                            editingPayTarget?.subscriptionId === sub.id &&
                                            editingPayTarget?.paymentId === pay.id
                                          ) {
                                            setEditingPayTarget(null);
                                          }
                                          removeSharedSubscriptionPayment(sub.id, pay.id);
                                        }}
                                        className="p-1 rounded text-text-muted hover:text-accent-red bg-transparent border-none cursor-pointer"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>

                                  {pay.notes && (
                                    <p className="text-[11px] text-text-muted flex items-center gap-1.5">
                                      <StickyNote
                                        size={11}
                                        className="shrink-0 text-accent-gold"
                                      />
                                      <span>{pay.notes}</span>
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {collectingModalData && (
        <RecordSharedPaymentModal
          key={`${collectingModalData.subscription.id}-${collectingModalData.member.id}`}
          subscription={collectingModalData.subscription}
          member={collectingModalData.member}
          onClose={() => setCollectingTarget(null)}
        />
      )}
    </div>
  );
}
