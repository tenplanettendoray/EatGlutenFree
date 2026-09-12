import { AccountControls, AccountExperience } from "../auth-ui";
import { BrandWordmark, SafeServeMark } from "../safe-serve-logo";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <main className="account-page">
      <header className="account-header">
        <Link className="brand" href="/" aria-label="Return to Gluten FreEat"><span className="brand-symbol"><SafeServeMark /></span><BrandWordmark /></Link>
        <AccountControls />
      </header>
      <section className="account-shell">
        <div className="account-card">
          <AccountExperience />
        </div>
      </section>
    </main>
  );
}
