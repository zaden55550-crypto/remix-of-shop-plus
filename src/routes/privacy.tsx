import { createFileRoute } from "@tanstack/react-router";
import { LegalPlaceholder } from "@/components/shopbook/legal-placeholder";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — DataQuill Solutions" }] }),
  component: () => <LegalPlaceholder title="Privacy Policy" />,
});
