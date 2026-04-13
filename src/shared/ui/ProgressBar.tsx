interface ProgressBarProps {
  current: number;
  target: number;
  label?: string;
  isPrivate?: boolean;
}

export function ProgressBar({ current, target, label, isPrivate = false }: ProgressBarProps) {
  const fraction = Math.min(current / target, 1);
  const percentage = (fraction * 100).toFixed(1);

  return (
    <div className="w-full">
      {label && (
        <p className="text-sm text-text-muted mb-2">
          {label}:{' '}
          <span className="text-text-primary font-semibold">
            {isPrivate ? '****' : `$${current.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          </span>
          {' / '}
          <span className="text-text-primary font-semibold">
            ${target.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </span>
        </p>
      )}
      <div className="w-full h-3 bg-bg-card rounded-full overflow-hidden border border-border">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${percentage}%`,
            background: `linear-gradient(90deg, #3b82f6, ${fraction >= 1 ? '#00ff9d' : '#6366f1'})`,
          }}
        />
      </div>
    </div>
  );
}
