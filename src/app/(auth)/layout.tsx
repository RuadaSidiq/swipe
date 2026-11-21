const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS: { d: number; t: string; text: string; c: string; tag?: string }[] = [
  { d: 0, t: "09:00", text: "Spring menu teaser", c: "#E1306C" }, { d: 0, t: "17:30", text: "Behind the bar", c: "#000" },
  { d: 1, t: "12:00", text: "Hiring: baristas", c: "#0A66C2" }, { d: 2, t: "08:15", text: "Launch day", c: "#1877F2", tag: "Live" },
  { d: 2, t: "19:00", text: "Q&A replies", c: "#25D366" }, { d: 3, t: "10:00", text: "Recipe card", c: "#E60023" },
  { d: 4, t: "11:30", text: "Weekend workshop", c: "#FF0000", tag: "Approval" }, { d: 5, t: "09:30", text: "Giveaway", c: "#E1306C" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(420px,1fr)_1.15fr]">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px]">
          <div className="mb-10 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: "var(--signal)" }} aria-hidden><span className="h-3 w-3 rounded-full" style={{ background: "var(--console)" }} /></span>
            <span className="font-display text-xl font-semibold">Orbit</span>
          </div>
          {children}
        </div>
      </div>

      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center lg:gap-16" style={{ background: "var(--console)" }} aria-hidden>
        <div className="px-12">
          <p className="font-display text-[44px] font-semibold leading-[1.05] tracking-tight text-white">Twelve networks.<br />One schedule.<br />One inbox.</p>
        </div>
        <div className="px-12">
          <div className="grid grid-cols-7 gap-2">
            {DAYS.map((d, i) => (
              <div key={d} className="relative min-h-[210px]">
                <div className={`mb-2 border-b border-white/10 pb-2 font-display text-sm ${i === 2 ? "text-white" : "text-[#7F9891]"}`}>{d}</div>
                {i === 2 && <div className="absolute bottom-0 top-8 left-[46%] w-[2px]" style={{ background: "var(--signal)", boxShadow: "0 0 14px rgba(255,201,60,.65)" }} />}
                <div className="relative flex flex-col gap-1.5">
                  {SLOTS.filter((s) => s.d === i).map((s) => (
                    <div key={s.text} className="rounded-lg px-2 py-1.5" style={{ background: s.tag === "Approval" ? "rgba(255,201,60,.16)" : "rgba(63,184,164,.16)" }}>
                      <div className="flex items-center justify-between text-[11px] tabular-nums" style={{ color: s.tag === "Approval" ? "#FFD35C" : "#9FD9CD" }}>{s.t}<span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.c }} /></div>
                      <div className="mt-0.5 text-[11.5px] leading-snug text-[#E6EEEB]">{s.text}</div>
                      {s.tag && <div className="mt-0.5 text-[10px]" style={{ color: s.tag === "Live" ? "#FF8A8D" : "#FFD35C" }}>{s.tag}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
