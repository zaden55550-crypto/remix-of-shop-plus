import { createFileRoute } from "@tanstack/react-router";
import { LegalPlaceholder } from "@/components/shopbook/legal-placeholder";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms & Conditions — Zakrio Systems" }] }),
  component: () => <LegalPlaceholder title="Terms & Conditions" />,
});
