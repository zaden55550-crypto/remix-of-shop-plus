import { Link } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/use-language";
import { PRIVACY, TERMS } from "@/lib/legal-text";

/** The Terms & Conditions or Privacy Policy linked from Create Account (opened in a new tab). The text lives in legal-text.ts;
 *  it is English for now, while the page's own headings and links are translated. */
export function LegalPlaceholder({ title }: { title: "Terms & Conditions" | "Privacy Policy" }) {
  const { tr } = useLanguage();
  const doc = title === "Terms & Conditions" ? TERMS : PRIVACY;
  return (
    <main className="app-screen signup-page legal-page">
      <article className="auth-card legal-doc">
        <header className="legal-head">
          <h1>{tr(title)}</h1>
          <p className="legal-updated">{tr("Last updated")}: {doc.updated}</p>
          <nav className="legal-links">
            <Link to="/signup">{tr("Back to Create Account")}</Link>
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
        <p className="legal-foot"><Link to="/signup">{tr("Back to Create Account")}</Link></p>
      </article>
    </main>
  );
}
