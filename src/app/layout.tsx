import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeSpace — Ta communauté, sans le bruit",
  description:
    "SafeSpace filtre tes commentaires YouTube et te livre des insights actionnables, sans toxicité ni stress.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-bg text-ink antialiased">
        <NextTopLoader
          color="#534AB7"
          height={2}
          showSpinner={false}
          shadow="0 0 8px rgba(83, 74, 183, 0.4)"
          easing="ease-out"
          speed={250}
        />
        {children}
      </body>
    </html>
  );
}
