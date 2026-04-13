import { AppLayout } from './layout/AppLayout';
import { Header } from './layout/Header';
import { Dashboard } from '../features/crypto-portfolio/components/Dashboard';

function App() {
  return (
    <AppLayout>
      <Header />
      <Dashboard />
    </AppLayout>
  );
}

export default App;
