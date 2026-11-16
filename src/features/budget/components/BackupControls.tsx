import { useRef, useState } from 'react';
import { Download, Upload, RotateCcw } from 'lucide-react';
import { useBudgetStore } from '../store/budgetStore';
import type { BudgetSnapshot } from '../types';

export function BackupControls() {
  const { exportSnapshot, importSnapshot, resetToSeed } = useBudgetStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleExport = () => {
    const snapshot = exportSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `control-financiero-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback({ type: 'ok', text: 'Respaldo JSON descargado.' });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BudgetSnapshot;
      const ok = importSnapshot(parsed);
      if (ok) {
        setFeedback({ type: 'ok', text: 'Respaldo importado correctamente.' });
      } else {
        setFeedback({ type: 'err', text: 'El archivo JSON no tiene el formato esperado.' });
      }
    } catch {
      setFeedback({ type: 'err', text: 'No se pudo leer el archivo JSON.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleReset = () => {
    if (window.confirm('¿Restaurar los datos de ejemplo iniciales? Se reemplazarán tus movimientos actuales.')) {
      resetToSeed();
      setFeedback({ type: 'ok', text: 'Datos restaurados al estado inicial.' });
    }
  };

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Respaldo Local (JSON)</h3>
          <p className="text-xs text-text-muted">
            Tus datos se guardan en este dispositivo. Exporta un respaldo cuando quieras.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
          />
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-bg-input border border-border text-text-primary hover:border-accent-green transition-colors cursor-pointer"
          >
            <Download size={14} /> Exportar JSON
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-bg-input border border-border text-text-primary hover:border-accent-blue transition-colors cursor-pointer"
          >
            <Upload size={14} /> Importar JSON
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-bg-input border border-border text-text-muted hover:text-accent-gold hover:border-accent-gold/40 transition-colors cursor-pointer"
          >
            <RotateCcw size={14} /> Demo
          </button>
        </div>
      </div>
      {feedback && (
        <p
          className={`mt-2 text-xs ${
            feedback.type === 'ok' ? 'text-accent-green' : 'text-accent-red'
          }`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
