export default function FallingPersonIcon({
  color, size = 16,
}: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth={8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="72" cy="12" r="9" />
      <line x1="68" y1="21" x2="45" y2="55" />
      <line x1="60" y1="35" x2="85" y2="20" />
      <line x1="58" y1="40" x2="35" y2="52" />
      <line x1="45" y1="55" x2="62" y2="75" />
      <line x1="45" y1="55" x2="18" y2="48" />
      <line x1="8"  y1="88" x2="92" y2="88" />
      <line x1="15" y1="82" x2="28" y2="88" />
      <line x1="35" y1="78" x2="48" y2="88" />
    </svg>
  );
}
