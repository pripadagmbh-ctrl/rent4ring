interface Props {
  /** Rendered width in pixels; the height follows the aspect ratio. */
  width?: number;
  className?: string;
}

/**
 * The Rent4Ring wordmark: two slanted red blocks reading RENT and RING, with
 * the oversized "4" sitting between them. The glyph overlaps the *bars* but is
 * kept clear of the lettering, so both words stay fully readable.
 */
export default function Logo({ width = 260, className }: Props) {
  const height = (width * 96) / 280;
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 280 96"
      role="img"
      aria-label="Rent4Ring"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id="r4r-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8203a" />
          <stop offset="100%" stopColor="#c40d24" />
        </linearGradient>
      </defs>

      {/* RENT — upper left */}
      <g transform="skewX(-12)">
        <rect x="12" y="18" width="112" height="30" rx="6" fill="url(#r4r-red)" />
        <text
          x="60"
          y="39.5"
          textAnchor="middle"
          fill="#fff"
          fontFamily="Barlow Condensed, Arial Narrow, sans-serif"
          fontWeight="700"
          fontSize="25"
          letterSpacing="2"
        >
          RENT
        </text>
      </g>

      {/* RING — lower right */}
      <g transform="skewX(-12)">
        <rect x="146" y="50" width="118" height="30" rx="6" fill="url(#r4r-red)" />
        <text
          x="208"
          y="71.5"
          textAnchor="middle"
          fill="#fff"
          fontFamily="Barlow Condensed, Arial Narrow, sans-serif"
          fontWeight="700"
          fontSize="25"
          letterSpacing="2"
        >
          RING
        </text>
      </g>

      {/* The oversized 4, straddling the gap between the two bars */}
      <g transform="translate(106 3) skewX(-12)">
        <path
          d="M34 0 L52 0 L52 46 L62 46 L62 62 L52 62 L52 82 L32 82 L32 62 L-6 62 L-6 44 Z
             M32 46 L32 22 L14 46 Z"
          fill="url(#r4r-red)"
          stroke="url(#r4r-red)"
          strokeWidth="11"
          strokeLinejoin="round"
        />
        <path
          d="M34 0 L52 0 L52 46 L62 46 L62 62 L52 62 L52 82 L32 82 L32 62 L-6 62 L-6 44 Z
             M32 46 L32 22 L14 46 Z"
          fill="#fff"
          fillRule="evenodd"
        />
      </g>
    </svg>
  );
}
