export function BrandWordmark() {
  return <span className="brand-lockup"><span className="brand-name">Gluten Freeat</span><small>Can I Eat It?</small></span>;
}

export function SafeServeMark({ className = "safe-serve-mark" }: { className?: string }) {
  return <img className={className} src="/gluten-freeat-mark.png" alt="" aria-hidden="true" />;
}
