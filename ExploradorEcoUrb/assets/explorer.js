/* Browser-only bibliography explorer. Article data stays in the adjacent JSON. */
document.addEventListener("DOMContentLoaded", () => {
  const byId = id => document.getElementById(id);
  const count = byId("article-count");
  const error = byId("load-error");
  const search = byId("search-input");
  const primaryFilter = byId("primary-filter");
  const secondaryFilter = byId("secondary-filter");
  const journalDetails = byId("journal-filter");
  const tagDetails = byId("tag-filter");
  const journalSummary = byId("journal-summary");
  const tagSummary = byId("tag-summary");
  const journalCount = byId("journal-selected-count");
  const tagCount = byId("tag-selected-count");
  const journalSearch = byId("journal-search");
  const journalOptions = byId("journal-options");
  const tagOptions = byId("tag-options");
  const calendar = byId("consultation-calendar");
  const calendarTitle = document.querySelector(".calendar-heading h2");
  const calendarYearLabel = byId("calendar-year");
  const calendarPrevious = byId("calendar-previous");
  const calendarNext = byId("calendar-next");
  const collator = new Intl.Collator("es", {sensitivity: "base", numeric: true});

  let table;
  let articles = [];
  let journals = [];
  let tags = [];
  let selectedJournals = new Set();
  let selectedTags = new Set();
  let selectedMonth = "";
  let availableMonths = new Set();
  let availableYears = [];
  let displayedYear = "";
  let tableReady = false;

  const text = value => value == null ? "" : String(value);
  const normalized = value => text(value).trim().toLocaleLowerCase("es-MX");
  const validHttpUrl = value => {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value.trim());
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  };
  const validColor = value => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);

  function appendText(parent, tagName, className, value) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    node.textContent = text(value);
    parent.append(node);
    return node;
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function formatDate(article) {
    const exact = typeof article.publication_date === "string" ? article.publication_date : "";
    const month = typeof article.published_month === "string" ? article.published_month : "";
    const source = article.date_precision === "month" ? (month || exact.slice(0, 7)) : exact;
    const monthMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(source);
    if (monthMatch) {
      const date = new Date(`${source}-01T00:00:00Z`);
      return new Intl.DateTimeFormat("es-MX", {month: "long", year: "numeric", timeZone: "UTC"}).format(date);
    }
    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(source) && Number.isFinite(Date.parse(source))) {
      return new Intl.DateTimeFormat("es-MX", {
        day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
      }).format(new Date(source));
    }
    return /^\d{4}$/.test(text(article.year)) ? text(article.year) : "";
  }

  function formatConsultationMonth(value) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text(value))) return "";
    return new Intl.DateTimeFormat("es-MX", {month: "long", year: "numeric", timeZone: "UTC"})
      .format(new Date(`${value}-01T00:00:00Z`));
  }

  function drawCalendar() {
    const yearIndex = availableYears.indexOf(displayedYear);
    calendarTitle.textContent = selectedMonth
      ? `Filtrando: ${formatConsultationMonth(selectedMonth)}`
      : "Mes de consulta";
    calendarYearLabel.textContent = displayedYear || "—";
    calendarPrevious.disabled = yearIndex <= 0;
    calendarNext.disabled = yearIndex < 0 || yearIndex >= availableYears.length - 1;
    calendar.replaceChildren();
    for (let month = 1; month <= 12; month += 1) {
      const key = `${displayedYear}-${String(month).padStart(2, "0")}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-month";
      button.textContent = new Intl.DateTimeFormat("es-MX", {month: "short", timeZone: "UTC"})
        .format(new Date(`${key}-01T00:00:00Z`)).replace(/\.$/, "");
      button.disabled = !availableMonths.has(key);
      button.setAttribute("aria-pressed", String(selectedMonth === key));
      button.setAttribute("aria-label", formatConsultationMonth(key));
      button.addEventListener("click", () => {
        selectedMonth = selectedMonth === key ? "" : key;
        drawCalendar();
        applyFilters();
      });
      calendar.append(button);
    }
  }

  function categoryOptionValues(field) {
    const values = new Map();
    for (const article of articles) {
      const category = article[field];
      if (category && typeof category.code === "string" && typeof category.name === "string") {
        values.set(category.code, category.name);
      }
    }
    return [...values].sort((a, b) => collator.compare(a[1], b[1]));
  }

  function checkboxOption(parent, {name, value, label, checked, className = ""}) {
    const wrapper = document.createElement("label");
    wrapper.className = `check-option ${className}`.trim();
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.value = value;
    input.checked = checked;
    const labelText = document.createElement("span");
    labelText.textContent = label;
    wrapper.append(input, labelText);
    parent.append(wrapper);
    return input;
  }

  function makeJournalOptions() {
    journals.forEach(journal => checkboxOption(journalOptions, {
      name: "journal", value: journal, label: journal, checked: true
    }));
    journalOptions.addEventListener("change", event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.checked) selectedJournals.add(input.value);
      else selectedJournals.delete(input.value);
      updateSelectionLabels();
      applyFilters();
    });
  }

  function makeTagOptions() {
    tags.forEach(tag => checkboxOption(tagOptions, {
      name: "tag", value: tag, label: tag, checked: false, className: "tag-check"
    }));
    tagOptions.addEventListener("change", event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.checked) selectedTags.add(input.value);
      else selectedTags.delete(input.value);
      updateSelectionLabels();
      applyFilters();
    });
  }

  function updateSelectionLabels() {
    const allJournals = selectedJournals.size === journals.length;
    journalSummary.textContent = allJournals ? "Todas las revistas"
      : selectedJournals.size === 0 ? "Ninguna revista"
      : `${selectedJournals.size} de ${journals.length} revistas`;
    journalCount.textContent = `${selectedJournals.size} de ${journals.length} seleccionadas`;
    tagSummary.textContent = selectedTags.size === 0 ? "Todas las etiquetas"
      : `${selectedTags.size} etiquetas seleccionadas`;
    tagCount.textContent = selectedTags.size === 0 ? `Sin filtro · ${tags.length} disponibles`
      : `${selectedTags.size} de ${tags.length} seleccionadas`;
  }

  function setCheckboxes(fieldset, values, selected) {
    fieldset.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.checked = selected ? selected.has(input.value) : values;
    });
  }

  function updateCount(activeRows) {
    const visible = Array.isArray(activeRows) ? activeRows.length : table.getDataCount("active");
    count.textContent = `${visible} de ${articles.length} artículos visibles`;
    count.classList.toggle("is-empty", visible === 0);
  }

  function applyFilters() {
    if (!table || !tableReady) return;
    const query = normalized(search.value);
    const primaryCode = primaryFilter.value;
    const secondaryCode = secondaryFilter.value;
    const queryMonth = selectedMonth;
    table.setFilter(article => {
      const searchText = normalized([article.title, article.journal, article.authors,
        article.summary_es, article.classification_note, article.category_primary?.name,
        article.category_secondary?.name, ...(Array.isArray(article.tags) ? article.tags : [])]
        .filter(Boolean).join(" "));
      const journalMatches = selectedJournals.size === journals.length
        || selectedJournals.has(text(article.journal));
      const tagMatches = selectedTags.size === 0 || (Array.isArray(article.tags)
        && article.tags.some(tag => selectedTags.has(tag)));
      return (!query || searchText.includes(query))
        && journalMatches
        && (!primaryCode || article.category_primary?.code === primaryCode)
        && (!secondaryCode || article.category_secondary?.code === secondaryCode)
        && (!queryMonth || article.consultation_month === queryMonth)
        && tagMatches;
    });
  }

  function addDoi(parent, doi) {
    if (typeof doi !== "string" || !/^10\.\d{4,9}\/\S+$/i.test(doi)) return;
    const doiLink = document.createElement("a");
    doiLink.className = "doi-link";
    doiLink.href = `https://doi.org/${encodeURI(doi)}`;
    doiLink.target = "_blank";
    doiLink.rel = "noopener noreferrer";
    doiLink.textContent = `DOI ${doi}`;
    parent.append(doiLink);
  }

  function renderRecord(article) {
    const record = document.createElement("article");
    record.className = "record";

    const title = document.createElement("h2");
    title.className = "record-title";
    const safeUrl = validHttpUrl(article.url);
    if (safeUrl) {
      const link = document.createElement("a");
      link.href = safeUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = text(article.title) || "Título no disponible";
      title.append(link);
    } else {
      title.textContent = text(article.title) || "Título no disponible";
    }
    const content = document.createElement("div");
    content.className = "record-content";
    const main = document.createElement("div");
    main.className = "record-main";
    const metadata = document.createElement("div");
    metadata.className = "record-metadata";
    const primary = article.category_primary;
    if (primary && typeof primary.name === "string") {
      const badge = appendText(metadata, "span", "primary-badge", primary.name);
      if (validColor(primary.color)) badge.style.setProperty("--primary-color", primary.color);
    } else {
      appendText(metadata, "span", "unclassified-badge", "Clasificación pendiente");
    }
    const secondary = article.category_secondary;
    if (secondary && typeof secondary.name === "string") {
      appendText(metadata, "span", "secondary-badge", secondary.name);
    }
    if (metadata.childElementCount) content.append(metadata);
    main.append(title);

    const citation = document.createElement("p");
    citation.className = "record-citation";
    if (text(article.journal)) appendText(citation, "strong", "record-journal", article.journal);
    const date = formatDate(article);
    if (date) appendText(citation, "span", "record-date", date);
    if (citation.childElementCount) main.append(citation);

    if (text(article.authors)) appendText(main, "p", "record-authors", article.authors);

    const summary = text(article.summary_es || article.classification_note).trim();
    if (summary) {
      const summaryBlock = document.createElement("p");
      summaryBlock.className = "record-summary";
      appendText(summaryBlock, "span", "record-summary-label", "Resumen en español");
      appendText(summaryBlock, "span", "record-summary-text", summary);
      main.append(summaryBlock);
    }

    const consultationMonth = formatConsultationMonth(article.consultation_month);
    const tags = Array.isArray(article.tags) ? article.tags : [];
    if (consultationMonth || tags.length) {
      const discoveryMeta = document.createElement("div");
      discoveryMeta.className = "record-discovery-meta";
      if (consultationMonth) appendText(discoveryMeta, "span", "consultation-chip", `Consulta: ${consultationMonth}`);
      if (tags.length) {
        const tagList = document.createElement("ul");
        tagList.className = "record-tags";
        tagList.setAttribute("aria-label", "Etiquetas");
        tags.forEach(value => appendText(tagList, "li", "tag-chip", value));
        discoveryMeta.append(tagList);
      }
      main.append(discoveryMeta);
    }

    const details = document.createElement("div");
    details.className = "record-details";
    addDoi(details, article.doi);
    const citationMeta = [article.volume && `Vol. ${article.volume}`, article.issue && `n.º ${article.issue}`,
      article.pages && `pp. ${article.pages}`].filter(Boolean).join(" · ");
    if (citationMeta) appendText(details, "span", "publication-meta", citationMeta);
    if (details.childElementCount) main.append(details);
    content.prepend(main);
    record.append(content);
    return record;
  }

  function compareByDate(a, b) {
    const left = Date.parse(text(a.publication_date));
    const right = Date.parse(text(b.publication_date));
    if (!Number.isFinite(left) && !Number.isFinite(right)) return collator.compare(text(a.title), text(b.title));
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    return right - left || collator.compare(text(a.title), text(b.title));
  }

  function setSort(buttonId, inactiveId) {
    const sortedArticles = [...articles].sort(buttonId === "sort-date"
      ? compareByDate
      : (a, b) => collator.compare(text(a.title), text(b.title)));
    table.setData(sortedArticles);
    table.setPage(1);
    byId(buttonId).setAttribute("aria-pressed", "true");
    byId(buttonId).classList.add("is-active");
    byId(inactiveId).setAttribute("aria-pressed", "false");
    byId(inactiveId).classList.remove("is-active");
  }

  function resetFilters() {
    search.value = "";
    journalSearch.value = "";
    journalOptions.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = true; });
    tagOptions.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
    selectedJournals = new Set(journals);
    selectedTags = new Set();
    primaryFilter.value = "";
    secondaryFilter.value = "";
    selectedMonth = "";
    journalOptions.querySelectorAll(".check-option").forEach(option => { option.hidden = false; });
    updateSelectionLabels();
    drawCalendar();
    setSort("sort-date", "sort-title");
    table.setPage(1);
    applyFilters();
  }

  function handleEscape(event) {
    if (event.key !== "Escape") return;
    const open = document.querySelector(".eco-explorer details[open]");
    if (open) {
      open.open = false;
      open.querySelector("summary")?.focus();
    }
  }

  async function initialize() {
    try {
      const dataUrl = new URL("./ExploradorEcoUrb/data/articles.json", document.baseURI);
      const response = await fetch(dataUrl, {headers: {Accept: "application/json"}});
      if (!response.ok) throw new Error(`No se pudo cargar el catálogo (${response.status}).`);
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.articles)) throw new Error("El JSON no contiene la lista de artículos esperada.");
      articles = payload.articles.filter(article => article && typeof article === "object");
      if (!articles.length) {
        count.textContent = "0 de 0 artículos visibles";
        byId("bibliography").textContent = "No hay artículos disponibles en este momento.";
        return;
      }

      journals = [...new Set(articles.map(article => text(article.journal).trim()).filter(Boolean))]
        .sort(collator.compare);
      availableMonths = new Set(articles.map(article => text(article.consultation_month))
        .filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)));
      availableYears = [...new Set([...availableMonths].map(month => month.slice(0, 4)))].sort();
      displayedYear = availableYears.length ? availableYears[availableYears.length - 1] : "";
      drawCalendar();
      tags = [...new Set(articles.flatMap(article => Array.isArray(article.tags) ? article.tags : [])
        .filter(tag => typeof tag === "string" && tag.trim()))].sort(collator.compare);
      selectedJournals = new Set(journals);

      categoryOptionValues("category_primary").forEach(([code, name]) => addOption(primaryFilter, code, name));
      categoryOptionValues("category_secondary").forEach(([code, name]) => addOption(secondaryFilter, code, name));
      makeJournalOptions();
      makeTagOptions();
      updateSelectionLabels();

      if (typeof window.Tabulator !== "function") throw new Error("No se pudo cargar Tabulator. Comprueba la conexión al CDN.");
      table = new Tabulator("#bibliography", {
        data: articles,
        index: "article_id",
        layout: "fitColumns",
        responsiveLayout: false,
        pagination: true,
        paginationMode: "local",
        paginationSize: 25,
        paginationSizeSelector: [10, 25, 50],
        paginationCounter: "rows",
        placeholder: "No hay artículos que coincidan con estos filtros.",
        columns: [
          {title: "Registro", field: "title", headerSort: false, variableHeight: true,
            formatter: cell => renderRecord(cell.getData())},
        ],
      });
      table.on("tableBuilt", () => {
        tableReady = true;
        table.on("dataFiltered", (_filters, activeRows) => updateCount(activeRows));
        table.setData([...articles].sort(compareByDate));
        applyFilters();
      });

      search.addEventListener("input", applyFilters);
      calendarPrevious.addEventListener("click", () => {
        const index = availableYears.indexOf(displayedYear);
        if (index > 0) { displayedYear = availableYears[index - 1]; drawCalendar(); }
      });
      calendarNext.addEventListener("click", () => {
        const index = availableYears.indexOf(displayedYear);
        if (index >= 0 && index < availableYears.length - 1) { displayedYear = availableYears[index + 1]; drawCalendar(); }
      });
      primaryFilter.addEventListener("change", applyFilters);
      secondaryFilter.addEventListener("change", applyFilters);
      byId("journal-select-all").addEventListener("click", () => {
        selectedJournals = new Set(journals);
        setCheckboxes(journalOptions, true);
        updateSelectionLabels();
        applyFilters();
      });
      byId("journal-clear").addEventListener("click", () => {
        selectedJournals.clear();
        setCheckboxes(journalOptions, false);
        updateSelectionLabels();
        applyFilters();
      });
      byId("tag-select-all").addEventListener("click", () => {
        selectedTags = new Set(tags);
        setCheckboxes(tagOptions, true);
        updateSelectionLabels();
        applyFilters();
      });
      byId("tag-clear").addEventListener("click", () => {
        selectedTags.clear();
        setCheckboxes(tagOptions, false);
        updateSelectionLabels();
        applyFilters();
      });
      journalSearch.addEventListener("input", () => {
        const query = normalized(journalSearch.value);
        journalOptions.querySelectorAll(".check-option").forEach(option => {
          option.hidden = !normalized(option.textContent).includes(query);
        });
      });
      byId("clear-filters").addEventListener("click", resetFilters);
      byId("sort-date").addEventListener("click", () => setSort("sort-date", "sort-title"));
      byId("sort-title").addEventListener("click", () => setSort("sort-title", "sort-date"));
      document.addEventListener("keydown", handleEscape);
      document.addEventListener("click", event => {
        if (!event.target.closest(".multi-filter")) {
          journalDetails.open = false;
          tagDetails.open = false;
        }
      });
    } catch (reason) {
      count.textContent = "No se pudieron cargar los artículos.";
      error.textContent = reason instanceof Error ? reason.message : "Ocurrió un error inesperado.";
      error.hidden = false;
      console.error("Error al iniciar el explorador bibliográfico:", reason);
    }
  }

  initialize();
});
