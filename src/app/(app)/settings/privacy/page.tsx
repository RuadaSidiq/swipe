import { PageHeader } from "@/components/ui";
import { SettingsClient } from "../SettingsClient";
import { loadSettings } from "../load";
export const metadata = { title: "Data & privacy" };
export default async function PrivacySettings() {
  const { props } = await loadSettings();
  return <><PageHeader title="Data & privacy" subtitle="Export or delete this workspace's data, or get help from our team." /><SettingsClient section="privacy" {...props} /></>;
}
