import { AccountExperience } from "../auth-ui";
import { SafeServeMark } from "../safe-serve-logo";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <main className="account-page">
      <header className="account-header">
        <Link className="brand" href="/" aria-label="Return to Safe Serve"><span className="brand-symbol"><SafeServeMark /></span><span>Safe Serve<small>CanIEatIt?</small></span></Link>
      </header>
      <section className="account-shell">
        <div className="account-art" aria-hidden="true"><span /><i /><b /></div>
        <div className="account-card">
          <AccountExperience />
        </div>
      </section>
    </main>
  );
}
