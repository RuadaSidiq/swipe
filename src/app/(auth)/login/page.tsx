import { AuthForm } from "@/components/AuthForm";
import { login } from "../actions";
export const metadata = { title: "Sign in" };
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (<><h1 className="mb-1 text-2xl font-semibold">Welcome back</h1><p className="muted mb-6 text-sm">Sign in to your workspace.</p><AuthForm mode="login" action={login} next={next} /></>);
}
