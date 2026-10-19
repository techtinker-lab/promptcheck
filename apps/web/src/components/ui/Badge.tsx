import type { ReactNode } from 'react';

export interface BadgeProps {
  variant?: 'pass' | 'fail' | 'warning' | 'neutral';
  size?: 'sm' | 'md';
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', size = 'md', children, className = '' }: BadgeProps) {
  const variants = {
    pass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800',
    fail: 'text-rose-400 bg-rose-950/40 border-rose-800',
    warning: 'text-amber-400 bg-amber-950/40 border-amber-800',
    neutral: 'text-zinc-400 bg-zinc-900 border-zinc-800',
  };

  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded-full border ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
}
