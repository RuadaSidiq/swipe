import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { MediaLibrary } from "./MediaLibrary";
export const metadata = { title: "Media library" };
export default async function MediaPage() {
  const ctx = await requireCtx();
  const [assets, folders] = await Promise.all([
    db.mediaAsset.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.mediaFolder.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { name: "asc" } }),
  ]);
  return (<><PageHeader title="Media library" />
    <MediaLibrary initial={JSON.parse(JSON.stringify(assets))} folders={folders} canManage={ctx.can("media.manage")} /></>);
}
