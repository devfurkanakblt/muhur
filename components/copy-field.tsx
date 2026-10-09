"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch rounded-[2px] border border-rule-strong bg-plinth">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-[0.8125rem] text-ink-2 focus:outline-none"
      />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="press flex w-28 items-center justify-center gap-1.5 border-l border-rule-strong text-[0.875rem] hover:bg-wall"
      >
        {copied ? <CheckIcon size={16} weight="bold" className="text-indigo" /> : <CopyIcon size={16} />}
        {copied ? "Kopyalandı" : "Kopyala"}
      </button>
    </div>
  );
}
