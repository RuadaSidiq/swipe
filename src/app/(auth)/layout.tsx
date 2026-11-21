import { SwipeLogo, PlatformBadge } from "@/components/ui";

const BARS = [42, 48, 39, 55, 51, 72];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12" style={{ background: "var(--panel)" }}>
        <div className="w-full max-w-[380px]">
          <div className="mb-10 flex items-center gap-2.5">
            <SwipeLogo size={36} />
            <span className="leading-tight"><span className="block font-display text-lg font-semibold">Orbit</span><span className="muted block text-xs">by Swipe</span></span>
          </div>
          {children}
        </div>
      </div>

      <div className="relative hidden items-center justify-center overflow-hidden p-12 lg:flex" style={{ background: "linear-gradient(145deg, #E6F7F0 0%, #BFEBD9 55%, #8ED9BB 100%)" }} aria-hidden>
        <div className="w-full max-w-[440px]">
          <p className="mb-8 font-display text-[38px] font-semibold leading-[1.1] text-[#0F1724]">All your social accounts in one calm place.</p>
          <div className="rounded-3xl bg-white p-6 shadow-[0_30px_60px_-30px_rgba(15,23,36,.35)]">
            <div className="flex items-start justify-between">
              <div><div className="text-sm font-medium text-[#0F1724]">Followers</div><div className="num mt-1 text-[32px] font-semibold text-[#0F1724]">59.4K</div></div>
              <span className="rounded-full bg-[#E6F7F0] px-2.5 py-1 text-xs font-semibold text-[#00714B]">↑ 6.3%</span>
            </div>
            <div className="mt-5 flex h-28 items-end gap-2.5">
              {BARS.map((h, i) => <div key={i} className="flex-1 rounded-t-lg" style={{ height: `${h + 28}%`, background: i === BARS.length - 1 ? "#00B37A" : "#DDF3EA" }} />)}
            </div>
            <div className="mt-5 flex items-center gap-2 border-t border-[#E3ECE8] pt-4">
              {["instagram", "facebook", "tiktok", "linkedin", "youtube", "x"].map((p) => <PlatformBadge key={p} id={p} size={28} />)}
              <span className="ml-1 text-xs font-medium text-[#5B6B75]">+6 more</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
