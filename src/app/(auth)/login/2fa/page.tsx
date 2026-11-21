import { TwoFactorForm } from "./TwoFactorForm";
export const metadata = { title: "Two-factor verification" };
export default function TwoFactor() {
  return (<><h1 className="mb-1 text-2xl font-semibold">Two-factor verification</h1><p className="muted mb-6 text-sm">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p><TwoFactorForm /></>);
}
