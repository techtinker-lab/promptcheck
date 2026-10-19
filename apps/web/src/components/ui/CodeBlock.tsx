import { CopyButton } from './CopyButton.js';

export interface CodeBlockProps {
  code: string;
  language?: string;
  showCopy?: boolean;
  className?: string;
}

export function CodeBlock({ code, language, showCopy = true, className = '' }: CodeBlockProps) {
  return (
    <div
      className={`relative group bg-zinc-950/80 border border-zinc-800 rounded-md overflow-hidden ${className}`}
    >
      {showCopy && (
        <div className="absolute top-2 right-2 opacity-80 group-hover:opacity-100 transition-opacity z-10">
          <CopyButton textToCopy={code} />
        </div>
      )}
      {language && (
        <div className="text-[10px] font-mono text-zinc-500 uppercase px-3 pt-2">{language}</div>
      )}
      <pre className="p-3 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
