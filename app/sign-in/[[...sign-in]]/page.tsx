import { SignInExperience } from "../../auth-ui";
import Link from "next/link";
import { SafeServeMark } from "../../safe-serve-logo";

export default function SignInPage() {
  return (
    <main className="auth-route">
      <Link className="brand auth-brand" href="/" aria-label="Return to Safe Serve"><span className="brand-symbol"><SafeServeMark /></span><span>Safe Serve<small>CanIEatIt?</small></span></Link>
      <div className="auth-route-card">
        <SignInExperience />
      </div>
    </main>
  );
}
