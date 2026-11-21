import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useSavedTheme } from "@/components/shopbook/ui";
import { PRIVACY, TERMS } from "@/lib/legal-text";
import { localizeLegal } from "@/lib/legal-translations";

/** The Terms & Conditions or Privacy Policy linked from Create Account (opened in a new tab, so the form in progress is kept).
 *  The text lives in legal-text.ts, with its translations in legal-translations.ts.
 *  Shown as one large, clear card (READABLE PAGES in styles.css). */
export function LegalPlaceholder({ title }: { title: "Terms & Conditions" | "Privacy Policy" }) {
  const { tr, language } = useLanguage();
  useSavedTheme();
  const nav = useNavigate();
  // The full text in the reader's language (legal-translations.ts); any sentence without an up-to-date translation stays English.
  const doc = localizeLegal(title === "Terms & Conditions" ? TERMS : PRIVACY, language);
  // Opened in its own tab: closing it returns to the form as it was. Reached another way (or a browser that keeps the tab),
  // go back a page, or to Create Account.
  const back = () => {
    if (window.history.length > 1) { window.history.back(); return; }
    window.close();
    window.setTimeout(() => { if (!window.closed) void nav({ to: "/signup" }); }, 300);
  };
  const backButton = <button type="button" className="readable-back" onClick={back}><ArrowLeft aria-hidden /> {tr("Back to Create Account")}</button>;
  return (
    <main className="app-screen signup-page legal-page readable-page">
      <article className="auth-card legal-doc readable-card">
        <header className="legal-head">
          {backButton}
          <h1>{tr(title)}</h1>
          <p className="legal-updated">{tr("Last updated")}: {doc.updated}</p>
          <nav className="legal-links">
            <Link to={title === "Terms & Conditions" ? "/privacy" : "/terms"}>{tr(title === "Terms & Conditions" ? "Privacy Policy" : "Terms & Conditions")}</Link>
          </nav>
        </header>
        {doc.intro.map((p, i) => <p key={i} className="legal-intro">{p}</p>)}
        {doc.sections.map((s) => (
          <section key={s.heading} className="legal-section">
            <h2>{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            {s.list && <ul>{s.list.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          </section>
        ))}
        <p className="legal-foot">{backButton}</p>
      </article>
    </main>
  );
}
