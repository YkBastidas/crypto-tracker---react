interface PrivacyValueProps {
  value: string | number;
  isPrivate: boolean;
  className?: string;
}

export function PrivacyValue({ value, isPrivate, className = '' }: PrivacyValueProps) {
  return (
    <span className={className}>
      {isPrivate ? '****' : value}
    </span>
  );
}
