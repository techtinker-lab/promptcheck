import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-zinc-900/50 border border-zinc-800 rounded-lg p-5 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
