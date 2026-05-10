import { Logo } from "@/components/logo";
import { GoogleSignInButton } from "./google-button";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string; error?: string };
}) {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-12 bg-bg">
      <div className="w-full max-w-md">
        <div className="ss-card p-8 shadow-elev">
          <div className="flex flex-col items-center text-center gap-3">
            <Logo />
            <p className="text-muted text-body mt-2">
              Ta communauté, sans le bruit.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <GoogleSignInButton from={searchParams.from} />
            {searchParams.error ? (
              <p className="text-caption text-amber text-center">
                Une erreur est survenue. Réessaie dans un instant.
              </p>
            ) : null}
          </div>

          <p className="mt-8 text-caption text-muted text-center">
            En continuant, tu acceptes nos conditions et notre politique de
            confidentialité. SafeSpace ne supprime jamais tes commentaires
            YouTube.
          </p>
        </div>

        <p className="mt-6 text-center text-caption text-muted">
          Pensé pour les créateurs YouTube et Instagram qui veulent reprendre
          le contrôle de leur attention.
        </p>
      </div>
    </main>
  );
}
