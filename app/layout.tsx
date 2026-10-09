import type { Metadata } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SaveEgg } from "@/components/save-egg";
import { env } from "@/lib/env";
import "./globals.css";

const grotesk = Schibsted_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin", "latin-ext"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: "mühür · DEÜ CS&AI Hackathon", template: "%s · mühür" },
  description: "Süre dolar, mühür vurulur. Hackathon projeleri son teslim anında mühürlenir.",
  applicationName: "mühür",
};

// Kayıtlı tema seçimi ilk boyamadan önce uygulanır; seçim yoksa CSS sistem temasını izler.
const themeScript = `(function(){try{var t=localStorage.getItem("tema");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${grotesk.variable} ${mono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#main-content" className="skip-link no-print">İçeriğe geç</a>
        {children}
        <SiteFooter />
        <SaveEgg />
      </body>
    </html>
  );
}
