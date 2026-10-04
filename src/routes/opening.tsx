import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Wordmark } from "@/components/shopbook/ui";

export const Route = createFileRoute("/opening")({
  head: () => ({
    meta: [
      { title: "Opening SHOPBOOK…" },
      { name: "description", content: "Opening your SHOPBOOK workspace." },
      { property: "og:title", content: "Opening SHOPBOOK…" },
      { property: "og:description", content: "Opening your SHOPBOOK workspace." },
    ],
  }),
  component: Opening,
});

function Opening() {
  const nav = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => nav({ to: "/apps", replace: true }), 1600);
    return () => clearTimeout(t);
  }, [nav]);
  return (
    <main className="app-screen flex flex-col items-center justify-center gap-6 px-6">
      <Wordmark className="text-2xl" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="h-4 w-4 rounded-full bg-primary dot-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold">Opening SHOPBOOK...</p>
        <p className="text-sm text-muted-foreground">Please wait a moment.</p>
      </div>
    </main>
  );
}
