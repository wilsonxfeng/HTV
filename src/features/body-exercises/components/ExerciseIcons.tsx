import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function KneeExtensionIcon({ size = 28, ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="7" cy="4" r="2"/>
    <path d="M3 10v7h8M4 17v4" strokeWidth={1.5}/>
    <path d="M7 8v5h7l7-1v-2"/>
    <path d="M14 14v6h3" strokeWidth={1.5} strokeDasharray="2 2" opacity={0.45}/>
  </svg>;
}

export function BicepCurlIcon({ size = 28, ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M3 19c3 1 6 2 9 1 3-1 5-3 6-6l2-8-3-2-3 1 1 3 2 1-3 6"/>
    <path d="M4 13c1-2 3-3 5-2l3 3 2 1M3 13v6"/>
  </svg>;
}
