import { requireUser } from "@/lib/auth";
import { createFirstWorkspace } from "../(auth)/actions";
export default async function Onboarding() {
  await requireUser();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={createFirstWorkspace} className="panel w-full max-w-sm space-y-3 p-6">
        <h1 className="text-lg font-semibold">Create a workspace</h1>
        <p className="muted text-sm">Workspaces keep each brand or client&apos;s accounts, content and conversations separate.</p>
        <input className="input" name="name" placeholder="Workspace name" required />
        <input type="hidden" name="timezone" value="UTC" />
        <button className="btn-primary w-full">Continue</button>
      </form>
    </main>
  );
}
