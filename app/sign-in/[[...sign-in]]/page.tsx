import { AccountControls, SignInExperience } from "../../auth-ui";
import Link from "next/link";
import { BrandWordmark, SafeServeMark } from "../../safe-serve-logo";

export default function SignInPage() {
  return (
    <main className="auth-route">
      <header className="auth-brand"><Link className="brand" href="/?step=allergies" aria-label="Return to Gluten FreEat allergy selection"><span className="brand-symbol"><SafeServeMark /></span><BrandWordmark /></Link><AccountControls /></header>
      <div className="auth-route-card">
        <SignInExperience />
      </div>
    </main>
  );
}
