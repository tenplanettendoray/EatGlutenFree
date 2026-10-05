"use client";

import { useEffect, useRef } from "react";

// A one-shot canvas simulation: no embeds, libraries, or permanent animation loop.
export function CustomConfetti() {
  const pendingAt = useRef<number | null>(null);
  useEffect(() => {
    try {
      if (pendingAt.current === null) pendingAt.current = Number(sessionStorage.getItem("custom-confetti-at"));
      const pending = pendingAt.current;
      sessionStorage.removeItem("custom-confetti-at");
      if (!pending || Date.now() - pending > 15000) return;
    } catch { return; }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    document.body.appendChild(canvas);
    let width = window.innerWidth;
    let height = window.innerHeight;
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);
    const colors = ["#f34242", "#2685ff", "#ffd52e"];
    const random = (min: number, max: number) => min + Math.random() * (max - min);
    const gravity = 880;
    const launch = Math.sqrt(2 * gravity * height) * 1.26;
    const pieces = Array.from({ length: width < 600 ? 170 : 280 }, (_, i) => ({
      x: width * random(0.37, 0.63), y: height + random(8, 45),
      vx: random(-width * 0.57, width * 0.57), vy: -launch * random(0.76, 1.13),
      angle: random(0, Math.PI * 2), spin: random(-12, 12),
      tilt: random(0, Math.PI * 2), tumble: random(5, 12),
      size: random(6, 12), drag: random(0.35, 0.8),
      color: colors[i % colors.length], delay: random(0, 0.18),
    }));
    let frame = 0;
    let elapsed = 0;
    let previous = performance.now();
    let pointer: { x: number; y: number; time: number } | null = null;
    const gusts: { x: number; y: number; dx: number; dy: number; born: number }[] = [];
    function movePointer(event: PointerEvent) {
      const now = performance.now();
      const next = { x: event.clientX, y: event.clientY, time: now };
      if (pointer && now - pointer.time < 150) {
        const dx = next.x - pointer.x;
        const dy = next.y - pointer.y;
        const length = Math.hypot(dx, dy);
        // Sample the swept path so fast swipes still catch pieces between events.
        const steps = Math.min(12, Math.max(1, Math.ceil(length / 35)));
        const limit = Math.min(1, 200 / Math.max(1, length));
        for (let i = 1; i <= steps; i++) {
          gusts.push({
            x: pointer.x + dx * i / steps, y: pointer.y + dy * i / steps,
            dx: dx * limit / steps, dy: dy * limit / steps, born: now,
          });
        }
        if (gusts.length > 160) gusts.splice(0, gusts.length - 160);
      }
      pointer = next;
    }
    function resetPointer() { pointer = null; gusts.length = 0; }
    window.addEventListener("pointermove", movePointer, { passive: true });
    window.addEventListener("blur", resetPointer);
    document.addEventListener("pointerleave", resetPointer);
    function cleanup() {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", movePointer);
      window.removeEventListener("blur", resetPointer);
      document.removeEventListener("pointerleave", resetPointer);
      canvas.remove();
    }
    function animate(now: number) {
      // Clamp resumed tabs to avoid huge physics jumps; use elapsed seconds, not frames.
      const dt = Math.min((now - previous) / 1000, 0.033);
      previous = now;
      elapsed += dt;
      while (gusts.length && now - gusts[0].born > 500) gusts.shift();
      ctx!.clearRect(0, 0, width, height);
      let alive = false;
      for (const p of pieces) {
        if (elapsed < p.delay) { alive = true; continue; }
        if (p.y > height + 70 && p.vy > 0) continue;
        alive = true;
        const flutter = Math.sin(p.tilt);
        p.vx += (flutter * 65 - p.vx * p.drag) * dt;
        p.vy += (gravity - p.vy * (p.vy > 0 ? 1.65 : p.drag * 0.25)) * dt;
        let windX = 0;
        let windY = 0;
        for (const gust of gusts) {
          const distance = Math.hypot(p.x - gust.x, p.y - gust.y);
          if (distance >= 155) continue;
          const influence = (1 - distance / 155) ** 2 * Math.exp(-(now - gust.born) / 140);
          windX += gust.dx * influence * 32;
          windY += gust.dy * influence * 32;
        }
        const windLimit = Math.min(1, 6500 / Math.max(1, Math.hypot(windX, windY)));
        p.vx += windX * windLimit * dt;
        p.vy += windY * windLimit * dt;
        p.spin = Math.max(-20, Math.min(20, p.spin + windX * windLimit * dt * 0.012));
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        p.tilt += p.tumble * dt;
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.angle);
        ctx!.scale(1, Math.max(0.08, Math.abs(Math.cos(p.tilt))));
        ctx!.globalAlpha = Math.min(1, Math.max(0, 8 - elapsed));
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        // The reverse face catches less light as each paper piece tumbles.
        if (Math.cos(p.tilt) < 0) {
          ctx!.fillStyle = "rgba(0,0,0,0.18)";
          ctx!.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        }
        ctx!.restore();
      }
      if (alive && elapsed < 8 && !reducedMotion.matches) frame = requestAnimationFrame(animate);
      else cleanup();
    }
    frame = requestAnimationFrame(animate);
    return cleanup;
  }, []);
  return null;
}
