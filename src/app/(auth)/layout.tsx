export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 text-lg font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white">◎</span> Orbit</div>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-indigo-700 to-ink-950 p-12 text-white lg:flex lg:flex-col lg:justify-end">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -right-8 top-24 h-64 w-64 rounded-full border border-white/10" />
        <h2 className="max-w-md text-3xl font-semibold leading-tight">One dashboard. Every social account. One inbox.</h2>
        <p className="mt-3 max-w-md text-white/70">Plan, publish and reply across Instagram, Facebook, TikTok, LinkedIn, YouTube, X, Pinterest, Threads, Reddit, WhatsApp, Telegram and more — with an AI assistant that knows your brand.</p>
      </div>
    </main>
  );
}
