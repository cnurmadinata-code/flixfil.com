interface FlixfilLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function FlixfilLogo({ size = 'md', className = '' }: FlixfilLogoProps) {
  const heightMap = {
    sm: 'h-6',
    md: 'h-7',
    lg: 'h-10',
    xl: 'h-14',
  };

  return (
    <span className={`inline-flex items-center select-none whitespace-nowrap shrink-0 ${className}`}>
      <svg
        viewBox="0 0 218 46"
        className={`${heightMap[size]} w-auto drop-shadow-[0_0_16px_rgba(255,22,61,0.45)]`}
        role="img"
        aria-label="FLIXFIL"
      >
        <defs>
          <linearGradient id="flixfilRedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF3355" />
            <stop offset="55%" stopColor="#FF163D" />
            <stop offset="100%" stopColor="#990020" />
          </linearGradient>
        </defs>
        {/* Custom geometric cinema aperture bar accent */}
        <path
          d="M2 7 L18 7 L14 14 L8 14 L8 20 L15 20 L12 26 L8 26 L8 39 L2 39 Z"
          fill="url(#flixfilRedGrad)"
        />
        {/* L */}
        <path
          d="M26 7 L33 7 L33 32 L46 32 L43 39 L26 39 Z"
          fill="url(#flixfilRedGrad)"
        />
        {/* I */}
        <path d="M52 7 L59 7 L59 39 L52 39 Z" fill="url(#flixfilRedGrad)" />
        {/* Modified geometric X with diagonal aperture split */}
        <path
          d="M66 7 L75 7 L83 19 L91 7 L99 7 L87 23 L100 39 L91 39 L83 27 L74 39 L66 39 L79 23 Z"
          fill="#FFFFFF"
        />
        <path d="M81 18 L85 18 L85 28 L81 28 Z" fill="#FF163D" />
        {/* F */}
        <path
          d="M107 7 L127 7 L124 14 L114 14 L114 20 L123 20 L120 26 L114 26 L114 39 L107 39 Z"
          fill="url(#flixfilRedGrad)"
        />
        {/* I */}
        <path d="M134 7 L141 7 L141 39 L134 39 Z" fill="url(#flixfilRedGrad)" />
        {/* L */}
        <path
          d="M150 7 L157 7 L157 32 L171 32 L168 39 L150 39 Z"
          fill="url(#flixfilRedGrad)"
        />
        {/* Minimalist play chevron mark integrated cleanly */}
        <path d="M180 15 L193 23 L180 31 Z" fill="#FF163D" />
      </svg>
    </span>
  );
}
