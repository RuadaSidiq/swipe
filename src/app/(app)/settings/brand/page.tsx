import { PageHeader } from "@/components/ui";
import { SettingsClient } from "../SettingsClient";
import { loadSettings } from "../load";
export const metadata = { title: "Brand" };
export default async function BrandSettings() {
  const { props } = await loadSettings();
  return <><PageHeader title="Brand" subtitle="Your brand voice, audience and guidelines. Swipe AI uses this whenever it writes for you." /><SettingsClient section="brand" {...props} /></>;
}
