// One slim row on the Dashboard, so its layout stays as it is; the steps float over the page when opened.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, ListChecks, X } from "lucide-react";
import { GlassNotice } from "@/components/shopbook/plan-loss";
import { useErp } from "@/components/shopbook/product-search";
import { useLanguage } from "@/hooks/use-language";
import {
  readSetupMarks,
  saveSetupMarks,
  setupListShown,
  setupSteps,
  type SetupMarks,
} from "@/lib/setup-checklist";
import { store } from "@/lib/shopbook";

export function SetupChecklist() {
  const s = useErp();
  const { tr } = useLanguage();
  const [marks, setMarks] = useState<SetupMarks>(() =>
    typeof window === "undefined" ? { seen: [], hidden: true } : readSetupMarks(),
  );
  const [open, setOpen] = useState(false);
  if (store.get()?.staff || !setupListShown(s, marks)) return null;

  const update = (next: SetupMarks) => {
    saveSetupMarks(next);
    setMarks(next);
  };
  const steps = setupSteps(s, marks.seen);
  const count = `${steps.filter((step) => step.done).length}/${steps.length}`;
  const title = tr("Set up your shop");
  return (
    <>
      <div className="setup-bar">
        <button type="button" className="setup-bar-open" onClick={() => setOpen(true)}>
          <ListChecks aria-hidden="true" />
          <span>{title}</span>
          <small>{tr("{x} done", count)}</small>
          <ChevronRight aria-hidden="true" />
        </button>
        <button
          type="button"
          className="setup-bar-hide"
          aria-label={tr("Hide this list")}
          title={tr("Hide this list")}
          onClick={() => update({ ...marks, hidden: true })}
        >
          <X />
        </button>
      </div>
      {open && (
        <GlassNotice title={title} onClose={() => setOpen(false)}>
          <ul className="setup-steps">
            {steps.map((step) => (
              <li key={step.id} data-done={step.done || undefined}>
                <Link
                  to={step.to}
                  search={step.search}
                  onClick={() => {
                    if (step.opensOnly && !step.done)
                      update({ ...marks, seen: [...marks.seen, step.id] });
                  }}
                >
                  <span className="setup-step-mark">
                    {step.done && <Check aria-hidden="true" />}
                  </span>
                  <span>{tr(step.label)}</span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </GlassNotice>
      )}
    </>
  );
}
