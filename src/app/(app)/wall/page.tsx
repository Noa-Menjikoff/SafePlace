import { Heart } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SupportWallCard,
  type WallEntry,
} from "@/components/support-wall-card";
import { AddToWallForm } from "@/components/add-to-wall-form";

export const dynamic = "force-dynamic";

type WallRow = {
  id: string;
  custom_text: string | null;
  author_name: string | null;
  created_at: string;
  comment_id: string | null;
  comment: {
    text: string | null;
    author_name: string | null;
  } | null;
};

export default async function WallPage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rawEntries } = await supabase
    .from("support_wall")
    .select(
      "id, custom_text, author_name, created_at, comment_id, comment:comments(text, author_name)"
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const entries: WallEntry[] = ((rawEntries ?? []) as unknown as WallRow[])
    .map((row) => {
      const text = row.custom_text ?? row.comment?.text ?? null;
      if (!text || !text.trim()) return null;
      const authorName =
        row.author_name ?? row.comment?.author_name ?? null;
      return {
        id: row.id,
        text,
        authorName,
        createdAt: row.created_at,
        isCustom: !row.comment_id,
      };
    })
    .filter((x): x is WallEntry => x !== null);

  const fromCheckin = searchParams.from === "checkin";

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">Mur de soutien</h1>
        <p className="text-muted text-body">
          Les mots qui te font du bien, à relire les jours difficiles.
        </p>
      </header>

      {fromCheckin ? (
        <section className="ss-card flex items-start gap-3 border-rose/30 bg-rose-light/60 p-5">
          <Heart className="h-5 w-5 text-rose mt-0.5" aria-hidden />
          <div>
            <p className="text-body font-medium text-rose">
              Prends une pause.
            </p>
            <p className="text-caption text-muted mt-1">
              Pas besoin d&apos;ouvrir tes commentaires aujourd&apos;hui. Voici
              les messages qui t&apos;ont fait du bien dernièrement.
            </p>
          </div>
        </section>
      ) : null}

      <section className="flex items-center justify-between gap-3">
        <p className="text-caption text-muted">
          {entries.length} message{entries.length > 1 ? "s" : ""} sur ton mur
        </p>
        <AddToWallForm />
      </section>

      {entries.length === 0 ? (
        <section className="ss-card p-10 text-center">
          <Heart className="h-6 w-6 mx-auto text-primary-mid" aria-hidden />
          <h2 className="text-h2 mt-3">Ton mur est vierge pour l&apos;instant</h2>
          <p className="text-muted mt-2 max-w-md mx-auto">
            Va dans le Clean Feed et clique sur{" "}
            <span className="text-primary font-medium">Mur de soutien</span>{" "}
            sous tes commentaires préférés. Ou écris un mot toi-même via le
            bouton « Ajouter manuellement ».
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((entry, idx) => (
            <SupportWallCard key={entry.id} entry={entry} index={idx} />
          ))}
        </section>
      )}
    </div>
  );
}
