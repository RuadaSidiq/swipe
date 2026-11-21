import { AuthForm } from "@/components/AuthForm";
import { signup } from "../actions";
export const metadata = { title: "Create account" };
export default async function Signup({ searchParams }: { searchParams: Promise<{ invite?: string; email?: string }> }) {
  const { invite, email } = await searchParams;
  return (<><h1 className="mb-1 text-2xl font-semibold">{invite ? "Join your team" : "Create your account"}</h1><p className="muted mb-6 text-sm">We never ask for your social media passwords — accounts connect through each network&apos;s official sign-in.</p><AuthForm mode="signup" action={signup} invite={invite} email={email} /></>);
}
