"use client";

import { useId, useState } from "react";

// Keep autocomplete small: native mobile datalists can stall when thousands
// of options are replaced while the keyboard and WebGL canvas resize.
export function CityInput({ id, value, options, onChange, onChoose }: {
  id: string; value: string; options: string[];
  onChange: (value: string) => void; onChoose: (value: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = value.trim().length >= 2 ? options.slice(0, 8) : [];
  const expanded = open && suggestions.length > 0;
  const activeSuggestion = active >= 0 && active < suggestions.length ? active : -1;
  function choose(city: string) {
    if (!city.trim()) return;
    setOpen(false);
    setActive(-1);
    onChoose(city.trim());
  }
  return <div className="city-autocomplete">
    <input id={id} value={value} placeholder="Type a city" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" maxLength={160}
      role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded && activeSuggestion >= 0 ? `${listId}-${activeSuggestion}` : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onChange={event => { setActive(-1); setOpen(true); onChange(event.target.value); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setOpen(true); setActive(index => (index + 1) % suggestions.length); }
        if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setOpen(true); setActive(index => index <= 0 || index >= suggestions.length ? suggestions.length - 1 : index - 1); }
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
        if (event.key === "Enter" && value.trim()) { event.preventDefault(); choose(expanded && activeSuggestion >= 0 ? suggestions[activeSuggestion] : value); }
      }} />
    {expanded && <div className="city-suggestions" id={listId} role="listbox" aria-label="Cities">
      {suggestions.map((city, index) => <button type="button" role="option" id={`${listId}-${index}`} aria-selected={active === index} tabIndex={-1} key={city}
        onPointerDown={event => event.preventDefault()} onClick={() => choose(city)}>{city}</button>)}
    </div>}
  </div>;
}
