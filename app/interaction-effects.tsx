"use client";
import { useEffect } from "react";
export function InteractionEffects() {
  useEffect(() => {
    function ripple(event: MouseEvent) {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (link instanceof HTMLAnchorElement && link.origin === window.location.origin && link.pathname === "/premium" && !window.location.pathname.startsWith("/premium") && window.location.pathname !== "/contact") {
        try { sessionStorage.setItem("premium-origin", window.location.pathname + window.location.search + window.location.hash); } catch { /* Storage may be unavailable. */ }
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const target = event.target instanceof Element ? event.target.closest(".premium-plan-options button") : null;
      if (!(target instanceof HTMLElement) || target.matches(":disabled,[aria-disabled='true']")) return;
      const rect = target.getBoundingClientRect();
      const mask = document.createElement("span"); mask.className = "interaction-ripple-mask";
      mask.style.setProperty("--ripple-color", getComputedStyle(target).getPropertyValue("--ripple-color").trim() || getComputedStyle(target).color);
      Object.assign(mask.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: getComputedStyle(target).borderRadius });
      const wave = document.createElement("span"); wave.className = "interaction-ripple";
      const size = Math.hypot(rect.width, rect.height) * 2;
      Object.assign(wave.style, { width: `${size}px`, height: `${size}px`, left: `${(event.detail ? event.clientX - rect.left : rect.width / 2) - size / 2}px`, top: `${(event.detail ? event.clientY - rect.top : rect.height / 2) - size / 2}px` });
      mask.appendChild(wave); document.body.appendChild(mask); setTimeout(() => mask.remove(), 650);
      const siblings = target.parentElement ? Array.from(target.parentElement.children) : [];
      siblings.forEach(sibling => {
        if (!(sibling instanceof HTMLElement) || sibling === target || !sibling.matches("button,a,[role='radio']")) return;
        const box = sibling.getBoundingClientRect();
        const dx = box.left + box.width / 2 - (rect.left + rect.width / 2);
        const dy = box.top + box.height / 2 - (rect.top + rect.height / 2);
        const distance = Math.hypot(dx, dy);
        if (distance > 500 || !distance) return;
        sibling.animate([{ translate: "0px 0px", scale: "1" }, { translate: `${dx / distance * 3}px ${dy / distance * 3}px`, scale: ".99" }, { translate: "0px 0px", scale: "1" }], { duration: 440, delay: Math.min(distance / 3, 100), easing: "ease-out" });
      });
      if (target.matches(".premium-plan-options button")) target.animate([{ scale: "1" }, { scale: ".96", offset: .2 }, { scale: "1.04", offset: .6 }, { scale: "1" }], { duration: 420, easing: "ease-out" });
    }
    document.addEventListener("click", ripple, true);
    return () => { document.removeEventListener("click", ripple, true); document.querySelectorAll(".interaction-ripple-mask").forEach(el => el.remove()); };
  }, []);
  return null;
}
