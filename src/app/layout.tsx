import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { NO_FLASH_THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeSpace — Ta communauté, sans le bruit",
  description:
    "SafeSpace filtre tes commentaires YouTube et te livre des insights actionnables, sans toxicité ni stress.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <NextTopLoader
          color="#534AB7"
          height={2}
          showSpinner={false}
          shadow="0 0 8px rgba(83, 74, 183, 0.4)"
          easing="ease-out"
          speed={250}
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
