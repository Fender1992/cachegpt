'use client';

interface CacheGPTLogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

export default function CacheGPTLogo({ size = 32, className = '', animated = true }: CacheGPTLogoProps) {
  const id = `logo-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: size * 0.2 }}
    >
      <defs>
        <linearGradient id={`bg-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed"/>
          <stop offset="100%" stopColor="#1d4ed8"/>
        </linearGradient>
        <radialGradient id={`core-${id}`} cx="50%" cy="50%">
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="40%" stopColor="#ede9fe" stopOpacity="0.9"/>
          <stop offset="80%" stopColor="#a78bfa" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
        </radialGradient>
        <filter id={`glow-${id}`}>
          <feGaussianBlur stdDeviation="12"/>
          <feMerge><feMergeNode/><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="96" fill={`url(#bg-${id})`}/>
      <circle cx="256" cy="256" r="160" fill="white" opacity="0.02"/>

      <g transform="translate(256,256)">
        {/* Outer arcs */}
        <g fill="none" strokeLinecap="round">
          <path d="M 50,-145 A 150,150 0 0,1 130,75" stroke="white" strokeWidth="2" strokeOpacity="0.09">
            {animated && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="50s" repeatCount="indefinite"/>}
          </path>
          <path d="M -130,-70 A 150,150 0 0,0 -40,145" stroke="white" strokeWidth="1.8" strokeOpacity="0.07">
            {animated && <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="55s" repeatCount="indefinite"/>}
          </path>
        </g>

        {/* Mid ring */}
        <g fill="none" strokeLinecap="round">
          <path d="M 0,-105 A 105,105 0 0,1 91,52" stroke="white" strokeWidth="3" strokeOpacity="0.18">
            {animated && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="30s" repeatCount="indefinite"/>}
          </path>
          <path d="M -60,87 A 105,105 0 0,1 -105,0" stroke="white" strokeWidth="2.8" strokeOpacity="0.15">
            {animated && <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="35s" repeatCount="indefinite"/>}
          </path>
        </g>

        {/* Inner ring — nearly complete, breathing */}
        <circle cx="0" cy="0" r="72" fill="none" stroke="white" strokeWidth="2.5" strokeOpacity="0.28" strokeDasharray="30 8">
          {animated && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="18s" repeatCount="indefinite"/>}
          {animated && <animate attributeName="strokeOpacity" values="0.22;0.35;0.22" dur="6s" repeatCount="indefinite"/>}
        </circle>

        {/* Particles */}
        <circle cx="0" cy="-105" r="3.5" fill="white" opacity="0.4">
          {animated && <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="10s" repeatCount="indefinite"/>}
        </circle>
        <circle cx="72" cy="0" r="3" fill="white" opacity="0.35">
          {animated && <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="-360 0 0" dur="8s" repeatCount="indefinite"/>}
        </circle>
        <circle cx="-50" cy="50" r="2.5" fill="white" opacity="0.25">
          {animated && <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="14s" repeatCount="indefinite"/>}
        </circle>

        {/* Heavy core */}
        <circle cx="0" cy="0" r="45" fill={`url(#core-${id})`} filter={`url(#glow-${id})`}/>
        <circle cx="0" cy="0" r="28" fill="white" opacity="0.95"/>
        {/* Inner diamond mark — the cache symbol */}
        <g transform="rotate(45)">
          <rect x="-10" y="-10" width="20" height="20" rx="2.5" fill={`url(#bg-${id})`} opacity="0.75"/>
        </g>
      </g>
    </svg>
  );
}
