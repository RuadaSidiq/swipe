import { AuthForm } from "@/components/AuthForm";
import { login } from "../actions";
export const metadata = { title: "Sign in" };
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (<><h1 className="font-display text-[30px] font-semibold">Welcome back</h1><p className="muted mb-7 mt-1 text-sm">Sign in to your workspace</p><AuthForm mode="login" action={login} next={next} /></>);
}
