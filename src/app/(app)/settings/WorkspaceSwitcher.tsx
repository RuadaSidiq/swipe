"use client";
import { useTransition } from "react";
import { Check } from "lucide-react";
import { switchWorkspace } from "@/app/(app)/_actions/common";

/** Lists the user's workspaces; switching keeps each workspace's data separate. */
export function WorkspaceSwitcher({ workspaces, currentId }: { workspaces: { id: string; name: string }[]; currentId: string }) {
  const [pending, start] = useTransition();
  return (
    <section className="panel mb-4 p-6">
      <h2 className="section-title">Your workspaces</h2>
      <p className="muted mt-0.5 text-sm">Switch between brands and clients. Each one keeps its own accounts, content and team.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {workspaces.map((w) => {
          const current = w.id === currentId;
          return (
            <li key={w.id} className="clay-inset flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[13px] font-bold text-white" style={{ background: "linear-gradient(145deg,#1FC48D,#00875A)" }}>{w.name[0]?.toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{w.name}</span>
              {current ? <span className="flex items-center gap-1 text-[13px] font-semibold text-[var(--accent)]"><Check size={15} /> Current</span>
                : <button className="btn-secondary py-1.5" disabled={pending} onClick={() => start(() => switchWorkspace(w.id))}>Switch</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
