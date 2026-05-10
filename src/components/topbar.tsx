import { LogOut } from "lucide-react";

type TopbarProps = {
  email?: string | null;
  channelName?: string | null;
};

export function Topbar({ email, channelName }: TopbarProps) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-bg/80 px-6 py-4 backdrop-blur">
      <div className="flex flex-col">
        <span className="text-caption text-muted">Espace créateur</span>
        <span className="text-body font-medium">
          {channelName ?? "Aucune chaîne connectée"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {email ? (
          <span className="hidden sm:inline text-caption text-muted">
            {email}
          </span>
        ) : null}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="ss-button-ghost h-9 px-3 text-caption"
            aria-label="Se déconnecter"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </form>
      </div>
    </header>
  );
}
