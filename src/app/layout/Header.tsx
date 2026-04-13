import { Eye, EyeOff, Settings } from 'lucide-react';
import { usePortfolioStore } from '../../shared/store/portfolioStore';
import { useState } from 'react';
import { getApiKey, saveApiKey } from '../../shared/lib/storage';

export function Header() {
  const { isPrivate, togglePrivacy, stablecoins, setStablecoins } = usePortfolioStore();
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKeyLocal] = useState(getApiKey());
  const [stablecoinsStr, setStablecoinsStr] = useState(stablecoins.join(', '));

  const handleSaveSettings = () => {
    saveApiKey(apiKey);
    setStablecoins(stablecoinsStr.split(','));
    setShowSettings(false);
  };

  return (
    <>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          📊 Personal Portfolio Tracker
        </h1>

        <div className="flex items-center gap-3">
          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
              bg-bg-card border border-border text-text-muted
              hover:text-text-primary hover:border-accent-blue
              transition-all cursor-pointer
            "
          >
            <Settings size={14} />
            Settings
          </button>

          {/* Privacy Toggle */}
          <button
            onClick={togglePrivacy}
            className="
              flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs
              bg-bg-card border border-border text-text-muted
              hover:text-text-primary hover:border-accent-gold
              transition-all cursor-pointer
            "
          >
            {isPrivate ? <EyeOff size={14} /> : <Eye size={14} />}
            {isPrivate ? 'Show Balances' : 'Hide Balances'}
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="mb-6 bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3">⚙️ Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-text-muted block mb-1">CoinGecko API Key (optional, for higher rate limits)</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKeyLocal(e.target.value)}
                placeholder="Your CoinGecko demo API key"
                className="
                  w-full px-3 py-2 rounded-lg text-sm
                  bg-bg-input border border-border text-text-primary
                  focus:outline-none focus:border-accent-blue
                "
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Stablecoin Tickers (comma separated)</label>
              <input
                type="text"
                value={stablecoinsStr}
                onChange={(e) => setStablecoinsStr(e.target.value)}
                placeholder="USDT, USDC, DAI"
                className="
                  w-full px-3 py-2 rounded-lg text-sm
                  bg-bg-input border border-border text-text-primary
                  focus:outline-none focus:border-accent-blue
                "
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveSettings}
                className="
                  px-4 py-2 rounded-lg text-sm font-medium
                  bg-accent-blue/20 border border-accent-blue/40 text-accent-blue
                  hover:bg-accent-blue/30 cursor-pointer transition-all
                "
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
