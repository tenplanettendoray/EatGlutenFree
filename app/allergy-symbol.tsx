type SymbolDefinition = {
  shape: string;
  detail: string;
};

function symbolFor(name: string): SymbolDefinition {
  const value = name.toLowerCase();

  if (/milk|dairy|lactose/.test(value)) return {
    shape: "M7 2h8l3 4v16H6V6l1-4Zm1 5h8l-2-3H9L8 7Z",
    detail: "M8 7h8M9 10h6v8H9zM10.5 13.2c.7-1.3 2.3-1.3 3 0 .7 1.2-.2 2.5-1.5 2.5s-2.2-1.3-1.5-2.5Z",
  };
  if (/egg/.test(value)) return {
    shape: "M12 2C8.2 2 5 10.8 5 15a7 7 0 0 0 14 0c0-4.2-3.2-13-7-13Z",
    detail: "M8.2 14.8c.3 2.2 1.8 3.7 3.8 3.7 1.7 0 3.1-.9 3.7-2.4M9.4 9.8c.6-1.8 1.4-3.1 2.3-4",
  };
  if (/tree nut|almond|cashew|walnut|hazelnut|pecan|pistachio|macadamia/.test(value)) return {
    shape: "M12 3c4.4 0 7.5 3.1 7.5 7.2 0 6.1-4.1 11.3-7.5 11.3S4.5 16.3 4.5 10.2C4.5 6.1 7.6 3 12 3Z",
    detail: "M6.7 8.1c3.2.8 7.4.8 10.6 0M12 6.2c-2 3.1-2.8 6.2-2.3 9.2.3 1.8 1.1 3.1 2.3 4M12 6.2c2 3.1 2.8 6.2 2.3 9.2-.3 1.8-1.1 3.1-2.3 4M9.7 11.1h4.6",
  };
  if (/peanut|groundnut/.test(value)) return {
    shape: "M8.8 2.2c3-.7 4.5 2.3 4 5.4 3-1.1 6.2.5 6.7 3.5.6 3.6-3.2 5-4.1 8.5-.8 3.1-4.6 4.1-7 2.1-2.3-2-1.6-5.1-.1-7.1-3.1.9-6-1.2-5.7-4.3.2-2.4 2.1-4.9 4.7-5.5Z",
    detail: "M7 6.4l4.1 3.1M13.2 10.7l3.7 2.1M7.5 13.1l3.7 2.1M11.3 17.1l2.6 1.4M9.1 4.2l2.2 1.6",
  };
  // Gluten uses the original wheat-stalk visual, with extra grain detail.
  if (/gluten/.test(value)) return {
    shape: "M11 2h2v20h-2V2ZM3 3.5c4.7.1 7 2.3 7 6.4-4.7-.1-7-2.3-7-6.4Zm18 0c-4.7.1-7 2.3-7 6.4 4.7-.1 7-2.3 7-6.4ZM3 10.7c4.7.1 7 2.3 7 6.4-4.7-.1-7-2.3-7-6.4Zm18 0c-4.7.1-7 2.3-7 6.4 4.7-.1 7-2.3 7-6.4Z",
    detail: "M5.1 5.4 9 8M18.9 5.4 15 8M5.1 12.7 9 15.3M18.9 12.7 15 15.3M12 4v16",
  };
  if (/wheat/.test(value)) return {
    shape: "M5 21V10c0-5 3-8 7-8s7 3 7 8v11H5Z",
    detail: "M6.8 10h10.4M8.2 7.5c1.7.9 3 .9 4.1 0M11.7 12.8c1.8.9 3.1.9 4.2 0M8.2 16.8c1.8.9 3.1.9 4.2 0",
  };
  if (/sesame/.test(value)) return {
    shape: "M7.7 3.2c2.7 1.4 3.4 4 1.8 6.2-2.8-.7-4.1-3.3-1.8-6.2Zm8.6 1.2c1.9 2.3 1.7 5-.6 6.5-2.2-1.8-2-4.8.6-6.5ZM4.3 12c3-.3 5.2 1.4 5.3 4.1-2.6 1.2-5.2-.4-5.3-4.1Zm10.8 1c3-.5 5.2 1.1 5.5 3.8-2.6 1.4-5.3 0-5.5-3.8ZM10 16c2.8-1.1 5.3 0 6.2 2.5-2.2 1.9-5.1 1-6.2-2.5Z",
    detail: "M7.5 5.4 8.7 8M15.7 6.6l-.4 2.3M6.3 13.8l2.1 1M17 14.7l2.1.7M12.1 17.4l2.4.7",
  };
  if (/soy|soya|soybean/.test(value)) return {
    shape: "M3 15.7C5.8 7.2 12.6 3.8 21 5.1c-.7 8.6-5.7 14.8-14.1 15.8L3 15.7Z",
    detail: "M5.2 17.5c4.1-1.6 8.4-5.1 12.6-10.2M8.2 15.1a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Zm4.6-3.8a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Zm3.8-3.7a1.5 1.5 0 1 0 0-3",
  };
  if (/crustacean|shellfish|shrimp|prawn|lobster|crab/.test(value)) return {
    shape: "M20.5 5.2c-5-3.4-12.5-1.3-14.7 4.3-1.7 4.3 1.8 8.6 6.3 8.5 3.2 0 5.7-2.1 6.7-5l3.2.7-1.5-3 1.5-2.8-3.1.5c.1-.9-.1-1.8-.4-2.6l1.9-.1ZM4.8 16 2 19h4.5",
    detail: "M7.3 8.5c2.9 2.3 6.6 3.2 10.8 2.5M8 12.3l-2.2 2.1M11.3 13.3l-1 3M14.7 13.1l.6 2.5M17.7 7.1h.1",
  };
  if (/mollusc|mollusk|clam|oyster|mussel|scallop/.test(value)) return {
    shape: "M3 18c0-7 3.8-13 9-15 5.2 2 9 8 9 15-5.3 4-12.7 4-18 0Z",
    detail: "M12 5v13M8.2 6.7 10.4 18M15.8 6.7 13.6 18M5.5 10l3 8M18.5 10l-3 8M4.1 18h15.8",
  };
  if (/mustard/.test(value)) return {
    shape: "M8 2h8v3l2 3v14H6V8l2-3V2Zm-4 8c2.4 0 4 1.6 4 4-2.4 0-4-1.6-4-4Zm16 0c-2.4 0-4 1.6-4 4 2.4 0 4-1.6 4-4Z",
    detail: "M9 5h6M8.5 10h7v8h-7zM10 13h4M10 15.5h4",
  };
  if (/celery/.test(value)) return {
    shape: "M7 22 5 8l3-6 3 6 1-6 2 6 3-6 2 6-2 14H7Z",
    detail: "M8 8.5 9.4 20M12 8v12M16 8.5 14.6 20M7.1 13h9.8M8 17h8",
  };
  if (/lupin|lupine/.test(value)) return {
    shape: "M11 22V8C7 8 5 5 6 2c3.6-.2 6 2.1 6 5 0-2.9 2.4-5.2 6-5 1 3-1 6-5 6v14h-2ZM4 10c4-.4 7 1.7 7 5-4 .4-7-1.7-7-5Zm16 2c-4-.4-7 1.7-7 5 4 .4 7-1.7 7-5Z",
    detail: "M8 4.5c1.4.4 2.4 1.3 3 2.5M16 4.5c-1.4.4-2.4 1.3-3 2.5M6.4 12.2 10 14M17.6 14.2 14 16",
  };
  if (/sulphite|sulfite|sulphur dioxide|sulfur dioxide/.test(value)) return {
    shape: "M7 2h10v3l-1 2v3.5c0 2.2 3 3.5 3 7A4.5 4.5 0 0 1 14.5 22h-5A4.5 4.5 0 0 1 5 17.5c0-3.5 3-4.8 3-7V7L7 5V2Z",
    detail: "M8 5h8M8 12c2 1.2 6 1.2 8 0M9 17h.1M12 15.5h.1M15 18h.1",
  };
  if (/corn|maize/.test(value)) return {
    shape: "M12 2c4 0 6 4.5 5 10.5 2.5-1 4.3-.5 5 1.5-2 5-5.5 7.7-10 8-4.5-.3-8-3-10-8 .7-2 2.5-2.5 5-1.5C6 6.5 8 2 12 2Z",
    detail: "M9 5.2h6M8.5 8.3h7M8.3 11.4h7.4M10 4v9M13 4v9M16 6v7M7 13c1.8 1 3.5 3.1 5 6M17 13c-1.8 1-3.5 3.1-5 6",
  };
  if (/fish|seafood/.test(value)) return {
    shape: "M2 12c5.6-8.2 11.6-8 16-2l4-4v12l-4-4c-4.4 6-10.4 6.2-16-2Z",
    detail: "M6 12h.1M9 8.4c1.5 2.2 1.5 5 0 7.2M13 7.6c1.6 2.6 1.6 6.2 0 8.8M18 10v4",
  };
  return {
    shape: "M12 2 21 6v6c0 5.1-3.7 8.6-9 10-5.3-1.4-9-4.9-9-10V6l9-4Z",
    detail: "M8 8.4c2.7.2 4 1.5 4 4-2.7-.2-4-1.5-4-4Zm8 0c-2.7.2-4 1.5-4 4 2.7-.2 4-1.5 4-4ZM12 12v6M9.5 16.5h5",
  };
}

export function AllergySymbol({ name }: { name: string }) {
  const symbol = symbolFor(name);
  return (
    <svg className="allergy-symbol" viewBox="0 0 24 24" aria-hidden="true">
      <path d={symbol.shape} fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
      <path className="allergy-symbol-detail" d={symbol.detail} />
    </svg>
  );
}
