import { AuthForm } from "@/components/AuthForm";
import { login } from "../actions";
export const metadata = { title: "Sign in" };
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (<><h1 className="mb-6 font-display text-[30px] font-semibold">Welcome back</h1><AuthForm mode="login" action={login} next={next} /></>);
}
