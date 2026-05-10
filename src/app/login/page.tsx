import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { GoogleSignInButton } from "./google-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string; error?: string };
}) {
  const t = await getTranslations("login");

  return (
    <main className="min-h-screen grid place-items-center px-4 py-12 bg-bg">
      <div className="w-full max-w-md">
        <div className="ss-card p-8 shadow-elev">
          <div className="flex flex-col items-center text-center gap-3">
            <Logo />
            <p className="text-muted text-body mt-2">{t("tagline")}</p>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <GoogleSignInButton from={searchParams.from} />
            {searchParams.error ? (
              <p className="text-caption text-amber text-center">
                {t("errorAuth")}
              </p>
            ) : null}
          </div>

          <p className="mt-8 text-caption text-muted text-center">
            {t("termsHint")}
          </p>
        </div>

        <p className="mt-6 text-center text-caption text-muted">
          {t("footer")}
        </p>
      </div>
    </main>
  );
}
