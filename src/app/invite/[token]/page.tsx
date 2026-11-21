import Link from "next/link";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { getSession } from "@/lib/auth";
import { acceptInvite } from "../../(auth)/actions";
import { ROLE_LABELS } from "@/lib/rbac";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await db.invite.findUnique({ where: { tokenHash: sha256(token) }, include: { workspace: true } });
  const session = await getSession();
  const valid = inv && !inv.acceptedAt && inv.expiresAt > new Date();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="panel w-full max-w-md space-y-4 p-6">
        {!valid ? <p>This invitation is invalid, already used or expired. Ask your workspace admin for a new one.</p> : (
          <>
            <h1 className="text-lg font-semibold">Join {inv.workspace.name}</h1>
            <p className="muted text-sm">You&apos;ve been invited as <b>{ROLE_LABELS[inv.role]}</b> ({inv.email}).</p>
            {session ? (
              <form action={acceptInvite.bind(null, token)}><button className="btn-primary w-full">Accept invitation as {session.user.email}</button></form>
            ) : (
              <div className="flex gap-2">
                <Link className="btn-primary flex-1" href={`/signup?invite=${token}&email=${encodeURIComponent(inv.email)}`}>Create account</Link>
                <Link className="btn-secondary flex-1" href={`/login?next=/invite/${token}`}>Sign in</Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
