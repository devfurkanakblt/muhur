export function filterGallery<T extends { name: string; team_name: string; exhibit_no: number }>(items: T[], query: string, sort: string) {
  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  const filtered = items.filter(i => `${i.name} ${i.team_name} ${i.exhibit_no}`.toLocaleLowerCase("tr-TR").includes(normalized));
  return filtered.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "tr")
    : sort === "team" ? a.team_name.localeCompare(b.team_name, "tr") : a.exhibit_no - b.exhibit_no);
}
