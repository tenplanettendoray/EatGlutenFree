export function BrandWordmark() {
  return <span className="brand-lockup"><span className="brand-name">Gluten FreEat</span><small>Can I Eat It?</small></span>;
}

export function SafeServeMark({ className = "safe-serve-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M24 3.75 40 9.6v12.1c0 10.5-6.45 18.45-16 22.55C14.45 40.15 8 32.2 8 21.7V9.6L24 3.75Z" fill="currentColor" />
      <circle cx="24" cy="22" r="10.25" fill="none" stroke="var(--safe-serve-detail, white)" strokeWidth="2.5" />
      <path d="m18.5 22.2 3.45 3.45 7.65-8" stroke="var(--safe-serve-detail, white)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 12.7v6.1M12.9 12.7v4.2M17.1 12.7v4.2" stroke="var(--safe-serve-detail, white)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
