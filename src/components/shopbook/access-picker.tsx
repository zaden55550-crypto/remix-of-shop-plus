// The access section of Add User (owner, 2026-11-24): one level per app and the sensitive rights by name, starting from the role.
// Logic and rules are in src/lib/access-levels.ts.
import { ACCESS_RULES, LEVELS, changedCount, effective, levelOf, setAll, setLevel, setRight, type Level } from "@/lib/access-levels";
import { MODULES, OWNER_ONLY, SENSITIVE, roleLabel } from "@/lib/staff-access";
import { cn } from "@/lib/utils";

type Tr = (text: string, x?: string) => string;

export function AccessPicker({ tr, role, access, onChange, disabled }: { tr: Tr; role: string; access?: Record<string, boolean> | undefined; onChange: (a: Record<string, boolean>) => void; disabled?: boolean }) {
  const on = effective(role, access), changed = changedCount(access);
  return <fieldset className="bsetup-field bsetup-editor-sec access-picker" disabled={disabled}>
    <legend>{tr("Access")} <small>· {tr("starts from")} {tr(roleLabel(role))}{changed ? ` · ${changed} ${tr("changed")}` : ""}</small></legend>
    <div className="access-quick">
      <button type="button" className={cn("access-quick-btn", !changed && "is-on")} onClick={() => onChange({})}>{tr("Role's access")}</button>
      <button type="button" className="access-quick-btn" onClick={() => onChange(setAll(role, true))}>{tr("Everything")}</button>
      <button type="button" className="access-quick-btn" onClick={() => onChange(setAll(role, false))}>{tr("Nothing")}</button>
    </div>
    <div className="access-apps" role="group" aria-label={tr("Access per app")}>
      {MODULES.map(([id, label]) => {
        const level = levelOf(on, id);
        return <label key={id} className={cn("access-app", level !== "none" && "is-on")}>
          <span>{tr(label)}</span>
          <select className="inventory-input" value={level} title={tr(LEVELS.find(([l]) => l === level)![2])} onChange={(e) => onChange(setLevel(role, access, id, e.target.value as Level))}>
            {LEVELS.map(([l, name]) => <option key={l} value={l}>{tr(name)}</option>)}
          </select>
        </label>;
      })}
    </div>
    <div className="access-rights" role="group" aria-label={tr("Sensitive rights")}>
      {SENSITIVE.map(([key, label]) => <label key={key} className={cn("access-right", on.has(key) && "is-on")}>
        <input type="checkbox" checked={on.has(key)} onChange={(e) => onChange(setRight(role, access, key, e.target.checked))} /><span>{tr(label)}</span>
      </label>)}
    </div>
    <details className="access-rules">
      <summary>{tr("How access works")}</summary>
      <ul>{ACCESS_RULES.map((r) => <li key={r}>{tr(r)}</li>)}</ul>
      <p><b>{tr("Always kept by the owner")}:</b> {OWNER_ONLY.map((x) => tr(x)).join(" · ")}</p>
      <p>{LEVELS.map(([, name, help]) => `${tr(name)}: ${tr(help)}`).join(" · ")}</p>
    </details>
  </fieldset>;
}
