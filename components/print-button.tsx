"use client";

import { PrinterIcon } from "@phosphor-icons/react";
import { buttonStyles } from "@/components/button-styles";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonStyles.ghost}>
      <PrinterIcon size={18} /> Yazdır ya da PDF olarak kaydet
    </button>
  );
}
