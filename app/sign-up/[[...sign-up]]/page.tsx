import { AccountControls, SignUpExperience } from "../../auth-ui";
import Link from "next/link";
import { BrandWordmark, SafeServeMark } from "../../safe-serve-logo";

export default function SignUpPage() {
  return (
    <main className="auth-route">
      <header className="auth-brand"><Link className="brand" href="/?step=allergies" aria-label="Return to Gluten FreEat allergy selection"><span className="brand-symbol"><SafeServeMark /></span><BrandWordmark /></Link><AccountControls /></header>
      <div className="auth-route-card">
        <SignUpExperience />
      </div>
    </main>
  );
}
