# Restaurant search evaluation — 12 September 2026

The NVIDIA model was not trained or fine-tuned. The application prompt, provider
order, source retrieval, parsing, evidence checks and cache policy were tuned and
evaluated repeatedly. Expected restaurant names and URLs are stored only in test
fixtures and are never sent to a model.

## Reproduced failure

An uncached Paris / Pizza / Gluten + Sesame search spent all 1,100 output tokens
on unfinished reasoning (`finish_reason: length`). The old parser extracted the
allergen array from that unfinished text and displayed Gluten and Sesame as
restaurant names. Even after reasoning was disabled, blind model-only calls still
invented venues, addresses, websites and allergy accommodations.

## Final search path

1. Groq Compound Mini runs one live basic web search for official restaurant and
   menu pages. The pinned `2025-07-23` basic-search version is required because
   this account rejected the newer advanced mode with HTTP 413.
2. Pages must resolve publicly and match the city and requested dish. Directory,
   review, delivery, travel and imitation-menu domains are rejected.
3. OpenRouter ranks only the verified source IDs. NVIDIA is the single fallback.
   Truncated or malformed output is discarded rather than partially parsed.
4. Application code extracts literal menu evidence. The model cannot supply a URL,
   address or allergy claim that is absent from its associated source.
5. If both ranking providers fail, a conservative deterministic pass can show
   independently verified source pages. It applies the same evidence checks.

Gluten-free evidence never implies sesame, wheat, milk, egg or nut accommodation.
A generic gluten-free salad or healthy-lifestyle statement does not prove that the
requested pizza, burger or ramen is gluten-free. Japanese `グルテンフリーラーメン`
is recognized, while Japanese text saying a venue is not compatible is rejected.
Missing evidence remains visibly unconfirmed.

## Blind observations

Repeated isolated NVIDIA runs found source-supported options in Paris, Lisbon,
Rome, New York, Madrid, London and Tokyo. Representative results included Little
Nonna and L'Artisan Napolitain; Street Smash Burgers; Voglia di Pizza, Teresina and
Lievito72; Schnipper's; LaLina and Triana; Wildwood Covent Garden; and Kousuke.
Incorrect directory brands and generic dish claims found during later passes were
added as regression cases or filters before release.

The final production-order Paris run returned Little Nonna and L'Artisan Napolitain
in 9.6 seconds and reported `OpenRouter`. Sesame remained unconfirmed. The NVIDIA
fallback order is covered by a request-level test.

These checks measure factual precision and graceful failure. They do not prove an
exhaustive result list, objective taste/popularity, or allergy safety. Exact
addresses are omitted when the official source does not state them. Users must
still confirm ingredients and cross-contact with restaurant staff.

## Validation

- 27 regression tests passed.
- TypeScript type checking passed.
- The benchmark requires at least one independently referenced official-domain hit
  for positive cases; a merely non-empty list does not pass.
- Search cache version 26 accepts only current grounded payloads for 24 hours and
  shares concurrent identical discovery work within a worker.

Run `node --env-file=.env.local scripts/evaluate-restaurant-search.mjs` to isolate
NVIDIA, or add `--runtime` to exercise the production provider order. Full results
are written to `.sites-runtime/restaurant-evaluation.json`.
