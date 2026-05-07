interface VindexIconProps {
  size?: number
  variant?: 'gold' | 'white' | 'dark'
  showAccent?: boolean
  className?: string
}

export default function VindexIcon({
  size = 40,
  variant = 'gold',
  showAccent = true,
  className = '',
}: VindexIconProps) {
  const stroke =
    variant === 'gold'  ? '#B79A5A' :
    variant === 'white' ? '#ffffff' :
    '#5A1220'

  const h = Math.round(size * 55 / 60)

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 60 55"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Barra horizontal superior */}
      <line x1="4" y1="4" x2="56" y2="4"
        stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />

      {/* V externo */}
      <polyline points="4,4 30,50 56,4"
        fill="none" stroke={stroke} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* V interno paralelo */}
      <polyline points="11,4 30,44 49,4"
        fill="none" stroke={stroke} strokeWidth="1.2"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* Losango central — acento bordô A&C */}
      {showAccent && (
        <polygon points="30,47 33,50 30,53 27,50" fill="#5A1220" />
      )}
    </svg>
  )
}
