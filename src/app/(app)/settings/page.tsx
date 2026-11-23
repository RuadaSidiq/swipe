import { PageHeader } from "@/components/ui";
import { SettingsClient } from "./SettingsClient";
import { loadSettings } from "./load";
export const metadata = { title: "Settings" };
export default async function GeneralSettings() {
  const { props } = await loadSettings();
  return <><PageHeader title="General" subtitle="Settings for this workspace. Changes apply to everyone in it." /><SettingsClient section="general" {...props} /></>;
}
