import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CoinCard } from './CoinCard';
import type { CoinHolding } from '../types';

interface CoinGridProps {
  holdings: CoinHolding[];
  onTargetChange?: () => void;
}

export function CoinGrid({ holdings, onTargetChange }: CoinGridProps) {
  const [showAll, setShowAll] = useState(false);
  const MAX_INITIAL = 8;

  const displayHoldings = showAll ? holdings : holdings.slice(0, MAX_INITIAL);
  const hasMore = holdings.length > MAX_INITIAL;

  if (holdings.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        <p className="text-lg">No crypto holdings yet.</p>
        <p className="text-sm mt-1">Upload a CSV or add your first transaction.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {displayHoldings.map((holding) => (
          <CoinCard
            key={holding.ticker}
            holding={holding}
            onTargetChange={onTargetChange}
          />
        ))}
      </div>

      {hasMore && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="
            mt-4 mx-auto flex items-center gap-2 px-6 py-2
            bg-bg-card border border-border rounded-lg
            text-text-muted hover:text-text-primary hover:border-accent-blue
            transition-all text-sm cursor-pointer
          "
        >
          Show All ({holdings.length} assets) <ChevronDown size={16} />
        </button>
      )}
    </div>
  );
}
