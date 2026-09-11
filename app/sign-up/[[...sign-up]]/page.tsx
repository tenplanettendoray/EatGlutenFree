import { AccountControls, SignUpExperience } from "../../auth-ui";
import Link from "next/link";
import { SafeServeMark } from "../../safe-serve-logo";

export default function SignUpPage() {
  return (
    <main className="auth-route">
      <header className="auth-brand"><Link className="brand" href="/" aria-label="Return to Safe Serve"><span className="brand-symbol"><SafeServeMark /></span><span>Safe Serve<small>CanIEatIt?</small></span></Link><AccountControls /></header>
      <div className="auth-route-card">
        <SignUpExperience />
      </div>
    </main>
  );
}
