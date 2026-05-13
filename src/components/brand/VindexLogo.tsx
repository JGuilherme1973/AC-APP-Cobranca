import VindexIcon from './VindexIcon'

type Variant = 'vertical' | 'horizontal' | 'icon-only'
type Theme   = 'dark' | 'light'
type Size    = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface VindexLogoProps {
  variant?: Variant
  theme?:   Theme
  size?:    Size
  className?: string
}

const ICON_SIZE: Record<Size, number> = {
  xs: 20, sm: 28, md: 40, lg: 56, xl: 80,
}
const NOME_SIZE: Record<Size, string> = {
  xs: '14px', sm: '18px', md: '24px', lg: '32px', xl: '46px',
}
const SUB_SIZE: Record<Size, string> = {
  xs: '8px', sm: '9px', md: '11px', lg: '13px', xl: '17px',
}
const ENDOSSO_SIZE: Record<Size, string> = {
  xs: '0.55rem', sm: '0.58rem', md: '0.65rem', lg: '0.7rem', xl: '0.75rem',
}

export default function VindexLogo({
  variant  = 'vertical',
  theme    = 'dark',
  size     = 'md',
  className = '',
}: VindexLogoProps) {
  const iconSize     = ICON_SIZE[size]
  const nomeFontSize = NOME_SIZE[size]
  const subFontSize  = SUB_SIZE[size]
  const endossoSize  = ENDOSSO_SIZE[size]
  const isDark       = theme === 'dark'
  const iconVariant  = isDark ? 'gold' : 'dark'
  const nomeColor    = isDark ? '#B79A5A' : '#5A1220'
  const subColor     = isDark ? '#C7CBD1' : '#666666'
  const lineColor    = '#B79A5A'

  if (variant === 'icon-only') {
    return <VindexIcon size={iconSize} variant={iconVariant} className={className} />
  }

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <VindexIcon size={iconSize} variant={iconVariant} />
        <div style={{ width: '1px', height: iconSize * 0.8, backgroundColor: 'rgba(183,154,90,0.3)', flexShrink: 0 }} />
        <div>
          <p style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: nomeFontSize, fontWeight: 700, color: nomeColor, letterSpacing: '5px', lineHeight: 1.1 }}>
            VINDEX
          </p>
          <p style={{ fontFamily: "'Lato', sans-serif", fontSize: subFontSize, fontWeight: 300, color: subColor, letterSpacing: '1.5px', lineHeight: 1.4, marginTop: '2px' }}>
            A Legal Desk da A&amp;C Advogados
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: '4px' }}>
            <span style={{ fontFamily: 'Lato, sans-serif', fontSize: endossoSize, letterSpacing: '0.12em', color: '#B79A5A', textTransform: 'uppercase' as const, opacity: 0.85 }}>
              by Andrade &amp; Cintra Advogados
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <VindexIcon size={iconSize} variant={iconVariant} />
      <p style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: nomeFontSize, fontWeight: 700, color: nomeColor, letterSpacing: '6px', marginTop: '12px', lineHeight: 1 }}>
        VINDEX
      </p>
      <div style={{ width: '80%', height: '1px', backgroundColor: lineColor, marginTop: '10px', marginBottom: '10px' }} />
      <p style={{ fontFamily: "'Lato', sans-serif", fontSize: subFontSize, fontWeight: 300, color: subColor, letterSpacing: '2px', textAlign: 'center', lineHeight: 1.5 }}>
        A Legal Desk da A&amp;C Advogados
      </p>
      {/* Endosso Modelo A */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '4px' }}>
        <span style={{ fontFamily: 'Lato, sans-serif', fontSize: endossoSize, letterSpacing: '0.12em', color: '#B79A5A', textTransform: 'uppercase' as const, opacity: 0.85 }}>
          by Andrade &amp; Cintra Advogados
        </span>
      </div>
    </div>
  )
}

