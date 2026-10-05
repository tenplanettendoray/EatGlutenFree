// Branch-specific identity; independent of search filters and recommendation votes.
export function restaurantRatingKey(name: string, address: string) {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return `${normalize(name)}|${normalize(address)}`.slice(0, 600);
}
