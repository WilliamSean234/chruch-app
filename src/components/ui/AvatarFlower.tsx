/** Bunga lima kelopak merah muda yang menempel di pojok kanan bawah foto inisial (induknya harus `relative`). Lihat lib/personalTouch. */
export default function AvatarFlower({ size = 14, className = "" }: { size?: number; className?: string }) {
  const petals = [0, 1, 2, 3, 4].map((i) => {
    const a = (i * 72 * Math.PI) / 180;
    return { x: 12 + Math.sin(a) * 5.4, y: 12 - Math.cos(a) * 5.4 };
  });
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute ${className}`} style={{ right: -Math.round(size * 0.35), bottom: -Math.round(size * 0.35), width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24">
        {petals.map((p, i) => <circle key={i} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r="3.8" fill="#E8789F" stroke="#FFFFFF" strokeWidth="0.8" />)}
        <circle cx="12" cy="12" r="2.6" fill="#F5C542" />
      </svg>
    </span>
  );
}
