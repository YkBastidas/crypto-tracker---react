import { useState } from 'react';
import { AppLayout, type AppView } from './layout/AppLayout';
import { Header } from './layout/Header';
import { Dashboard as CryptoDashboard } from '../features/crypto-portfolio/components/Dashboard';
import { BudgetDashboard } from '../features/budget/components/BudgetDashboard';
import { QuincenaWizard } from '../features/budget/components/QuincenaWizard';
import { ExpensesAndPayments } from '../features/budget/components/ExpensesAndPayments';

function App() {
  const [activeView, setActiveView] = useState<AppView>('resumen');

  return (
    <AppLayout activeView={activeView} onChangeView={setActiveView}>
      {activeView === 'resumen' && (
        <BudgetDashboard
          onNavigateQuincena={() => setActiveView('quincena')}
          onNavigateExpenses={() => setActiveView('gastos')}
        />
      )}

      {activeView === 'quincena' && (
        <QuincenaWizard onCompleteNavigate={() => setActiveView('resumen')} />
      )}

      {activeView === 'gastos' && <ExpensesAndPayments />}

      {activeView === 'crypto' && (
        <>
          <Header />
          <CryptoDashboard />
        </>
      )}
    </AppLayout>
  );
}

export default App;
