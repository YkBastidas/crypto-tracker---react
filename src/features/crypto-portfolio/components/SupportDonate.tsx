import { Heart, Copy, Check } from 'lucide-react';
import { useState } from 'react';

const USDT_ADDRESS = 'TXwZLicjcGsMrEMpXDo4qSGfBR5FBxGPaf';

export function SupportDonate() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(USDT_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy
      const ta = document.createElement('textarea');
      ta.value = USDT_ADDRESS;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="mt-auto pt-6 border-t border-border">
      <div className="bg-bg-primary/50 rounded-lg p-3">
        <p className="text-xs text-text-muted flex items-center gap-1.5 mb-2">
          <Heart size={12} className="text-accent-red" />
          Support the project
        </p>
        <p className="text-[10px] text-text-muted mb-1">Donate USDT (TRC20):</p>
        <button
          onClick={handleCopy}
          className="
            w-full flex items-center gap-2 px-2 py-1.5 rounded
            bg-bg-input border border-border text-[10px] font-mono
            text-text-muted hover:text-text-primary hover:border-accent-gold
            transition-all cursor-pointer break-all text-left
          "
        >
          <span className="flex-1 truncate">{USDT_ADDRESS}</span>
          {copied ? <Check size={12} className="text-accent-green shrink-0" /> : <Copy size={12} className="shrink-0" />}
        </button>
      </div>
    </div>
  );
}
