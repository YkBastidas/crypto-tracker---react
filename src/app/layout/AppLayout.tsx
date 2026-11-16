import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bitcoin,
  CalendarClock,
  Download,
  Eye,
  EyeOff,
  HelpCircle,
  LayoutDashboard,
  Menu,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { usePortfolioStore } from '../../shared/store/portfolioStore';
import { parseCsvFile, exportCsv } from '../../shared/lib/csv';
import { TransactionForm } from '../../features/crypto-portfolio/components/TransactionForm';
import { SupportDonate } from '../../features/crypto-portfolio/components/SupportDonate';
import { HelpModal } from './HelpModal';

export type AppView = 'resumen' | 'quincena' | 'gastos' | 'crypto';

interface AppLayoutProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  children: ReactNode;
}

const NAV_ITEMS: { id: AppView; label: string; shortLabel: string; icon: ReactNode }[] = [
  {
    id: 'resumen',
    label: 'Resumen',
    shortLabel: 'Resumen',
    icon: <LayoutDashboard size={18} />,
  },
  {
    id: 'quincena',
    label: 'Registrar Quincena',
    shortLabel: 'Quincena',
    icon: <Sparkles size={18} />,
  },
  {
    id: 'gastos',
    label: 'Gastos y Pagos',
    shortLabel: 'Gastos',
    icon: <CalendarClock size={18} />,
  },
  {
    id: 'crypto',
    label: 'Portafolio Crypto',
    shortLabel: 'Crypto',
    icon: <Bitcoin size={18} />,
  },
];

export function AppLayout({ activeView, onChangeView, children }: AppLayoutProps) {
  const { transactions, isDirty, isPrivate, togglePrivacy, setDirty, loadTransactions } =
    usePortfolioStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // beforeunload warning for unsaved crypto CSV changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const txs = await parseCsvFile(file);
      loadTransactions(txs);
    },
    [loadTransactions],
  );

  const handleExport = useCallback(() => {
    exportCsv(transactions);
    setDirty(false);
  }, [transactions, setDirty]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary text-text-primary">
      {/* Mobile overlay for Crypto drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop Sidebar & Mobile Drawer */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-[290px] bg-bg-sidebar border-r border-border
          flex flex-col p-5 overflow-y-auto
          transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Brand */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold flex items-center gap-2">
            📊{' '}
            <span className="bg-gradient-to-r from-accent-blue to-accent-green bg-clip-text text-transparent">
              Control Financiero
            </span>
          </h1>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1.5 mb-6">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChangeView(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-accent-blue/15 border-accent-blue/40 text-accent-blue'
                    : 'bg-transparent border-transparent text-text-muted hover:text-text-primary hover:bg-bg-card'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Contextual Crypto Tools when in Crypto view */}
        {activeView === 'crypto' && (
          <div className="pt-4 border-t border-border flex-1 flex flex-col">
            <p className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-3">
              Herramientas Crypto CSV
            </p>
            <div className="flex gap-2 mb-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="
                  flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium
                  bg-bg-card border border-border text-text-muted
                  hover:text-text-primary hover:border-accent-blue
                  transition-all cursor-pointer
                "
              >
                <Upload size={14} /> Upload CSV
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={transactions.length === 0}
                className="
                  flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium
                  bg-bg-card border border-border text-text-muted
                  hover:text-text-primary hover:border-accent-green
                  disabled:opacity-30 transition-all cursor-pointer
                "
              >
                <Download size={14} /> Export CSV
              </button>
            </div>

            {isDirty && (
              <div className="mb-4 bg-accent-gold/10 border border-accent-gold/30 rounded-lg px-3 py-2 text-xs text-accent-gold">
                ⚠️ Unsaved changes — remember to download your CSV.
              </div>
            )}

            <TransactionForm />
            <SupportDonate />
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar (Mobile & Desktop) */}
        <header className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3.5 border-b border-border bg-bg-sidebar/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            {activeView === 'crypto' && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                title="Abrir herramientas Crypto"
                className="lg:hidden p-1.5 rounded-lg bg-bg-card border border-border text-text-muted hover:text-text-primary cursor-pointer"
              >
                <Menu size={18} />
              </button>
            )}
            <h2 className="text-base sm:text-lg font-bold text-text-primary">
              {NAV_ITEMS.find((i) => i.id === activeView)?.label}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-card border border-border text-text-muted hover:text-text-primary hover:border-accent-blue transition-all cursor-pointer"
            >
              <HelpCircle size={14} />
              <span>Cómo usar</span>
            </button>

            <button
              type="button"
              onClick={togglePrivacy}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-card border border-border text-text-muted hover:text-text-primary hover:border-accent-gold transition-all cursor-pointer"
            >
              {isPrivate ? <EyeOff size={14} /> : <Eye size={14} />}
              <span className="hidden sm:inline">
                {isPrivate ? 'Mostrar Montos' : 'Ocultar Montos'}
              </span>
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-bg-sidebar/95 backdrop-blur-md border-t border-border px-2 py-1.5 flex items-center justify-around">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeView(item.id)}
                className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl text-[11px] font-medium transition-colors bg-transparent border-none cursor-pointer ${
                  isActive ? 'text-accent-blue' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {item.icon}
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        onNavigate={(view) => onChangeView(view)}
      />
    </div>
  );
}
