import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { getAppContext } from "@/lib/auth-context";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  const channelName = ctx.channels[0]?.name ?? null;

  return (
    <div className="min-h-screen flex items-start bg-bg">
      <Sidebar plan={ctx.plan} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar
          email={ctx.user.email}
          channelName={channelName}
          plan={ctx.plan}
        />
        <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  );
}
