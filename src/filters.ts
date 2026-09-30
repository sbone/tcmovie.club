// Embedded in each static page; this function must not depend on module imports.
export function initTheaterFilters() {
  const controls = document.querySelector<HTMLFieldSetElement>("#theater-filters")!;
  const buttons = [...controls.querySelectorAll<HTMLButtonElement>("button[data-theater]")];
  const ids = buttons.map(button => button.dataset.theater!);
  const rows = [...document.querySelectorAll<HTMLLIElement>(".screenings li[data-venue]")];
  const links = [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Dates"] a')];
  const status = document.querySelector<HTMLElement>("#filter-status")!;
  const reset = controls.querySelector<HTMLButtonElement>("button[data-reset]")!;
  const readSelection = () => {
    const value = new URL(location.href).searchParams.get("theaters");
    return new Set(ids.filter(id => value === null || value.split(",").includes(id)));
  };
  let selected = readSelection();
  const filterUrl = (url: URL) => {
    if (selected.size === ids.length) url.searchParams.delete("theaters");
    else url.searchParams.set("theaters", ids.filter(id => selected.has(id)).join(","));
    url.searchParams.delete("ratings");
    return url;
  };
  const show = () => {
    for (const button of buttons) button.setAttribute("aria-pressed", String(selected.has(button.dataset.theater!)));
    for (const row of rows) row.hidden = !selected.has(row.dataset.venue!);
    for (const link of links) link.href = filterUrl(new URL(link.href, location.href)).href;
    reset.disabled = selected.size === ids.length;
    const count = rows.filter(row => !row.hidden).length;
    status.textContent = selected.size === 0 ? "No theaters selected. Choose a theater to see its screenings."
      : count === 0 ? "No screenings listed for these theaters on this date."
      : `${count} screening${count === 1 ? "" : "s"} shown`;
  };
  const update = () => {
    history.pushState(null, "", filterUrl(new URL(location.href)));
    show();
  };
  for (const button of buttons) button.addEventListener("click", () => {
    const id = button.dataset.theater!;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    update();
  });
  reset.addEventListener("click", () => { selected = new Set(ids); update(); });
  window.addEventListener("popstate", () => { selected = readSelection(); show(); });
  show();
  controls.hidden = false;
}
