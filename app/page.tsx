export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">ForgeMind</h1>
        <p className="mt-2 text-sm uppercase tracking-[0.2em] text-slate-400">
          AI Software Engineer
        </p>
      </div>
      <p className="text-lg text-slate-300">Reason → Decide → Execute</p>
      <p className="font-mono text-slate-400">GitHub → Jira → Slack</p>
      <p className="text-sm text-emerald-400">Foundation ready.</p>
    </main>
  );
}
