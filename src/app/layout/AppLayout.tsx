import { useCallback, useRef, type ReactNode } from 'react';
import { Upload, Download, Menu, X } from 'lucide-react';
import { usePortfolioStore } from '../../shared/store/portfolioStore';
import { parseCsvFile, exportCsv } from '../../shared/lib/csv';
import { TransactionForm } from '../../features/crypto-portfolio/components/TransactionForm';
import { SupportDonate } from '../../features/crypto-portfolio/components/SupportDonate';
import { useState, useEffect } from 'react';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { transactions, isDirty, setDirty, loadTransactions } = usePortfolioStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // beforeunload warning for unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const txs = await parseCsvFile(file);
    loadTransactions(txs);
  }, [loadTransactions]);

  const handleExport = useCallback(() => {
    exportCsv(transactions);
    setDirty(false);
  }, [transactions, setDirty]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-[320px] bg-bg-sidebar border-r border-border
          flex flex-col p-5 overflow-y-auto
          transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold flex items-center gap-2">
            📊 <span className="bg-gradient-to-r from-accent-blue to-accent-green bg-clip-text text-transparent">Portfolio Tracker</span>
          </h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* CSV Upload / Download */}
        <div className="flex gap-2 mb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="
              flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium
              bg-bg-card border border-border text-text-muted
              hover:text-text-primary hover:border-accent-blue
              transition-all cursor-pointer
            "
          >
            <Upload size={14} /> Upload CSV
          </button>
          <button
            onClick={handleExport}
            disabled={transactions.length === 0}
            className="
              flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium
              bg-bg-card border border-border text-text-muted
              hover:text-text-primary hover:border-accent-green
              disabled:opacity-30 transition-all cursor-pointer
            "
          >
            <Download size={14} /> Download CSV
          </button>
        </div>

        {isDirty && (
          <div className="mb-4 bg-accent-gold/10 border border-accent-gold/30 rounded-lg px-3 py-2 text-xs text-accent-gold">
            ⚠️ Unsaved changes — remember to download your CSV.
          </div>
        )}

        {/* Transaction Form */}
        <TransactionForm />

        {/* Support / Donate */}
        <SupportDonate />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-bg-sidebar">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-sm font-bold text-text-primary">📊 Portfolio Tracker</h1>
          <div className="w-6" /> {/* Spacer for centering */}
        </div>

        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
