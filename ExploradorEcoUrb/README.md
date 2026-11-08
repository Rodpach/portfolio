# Guía breve para editar el explorador

- `explorer.qmd`: texto y estructura.
- `explorer.css`: apariencia y adaptación a móviles.
- `explorer.js`: filtros y comportamiento interactivo.

Edita estos archivos fuente, no `output/`: se regenera y sobrescribe.

## Datos para visualizaciones

`articles.json` es un objeto con metadatos generales (`generated_at`, `consultation_month`, `window_start`, `window_months`, `categories`) y un arreglo `articles`. Cada artículo puede incluir:

- Identificación y texto: `article_id`, `title`, `summary_es`, `authors`, `journal`, `tags`.
- Fechas: `consultation_month` (`YYYY-MM`), `publication_date` (`YYYY-MM-DD` o `null`), `published_month`, `year`.
- Clasificación: `category_primary` y `category_secondary` (objetos con código/nombre; la principal incluye color), `tags`.
- Referencias: `doi`, `url`, `volume`, `issue`, `pages`.

Los campos opcionales pueden ser `null` o no aparecer. Antes de graficar, filtra valores ausentes y usa `consultation_month` para el ciclo de consulta; las fechas de publicación representan otro dato. El JSON generado es la fuente disponible para visualizaciones e interacciones.

Al terminar, informa brevemente qué archivos cambiaste y recuérdame cómo comprobarlo:

1. Regenerar: `python3 scripts/04_publish.py --publish-existing-master`
2. Transferir: `~/Documents/Proyectos/feed_EcoUrb/scripts/transferir_explorador.sh`
3. Probar/publicar: `~/Documents/Proyectos/feed_EcoUrb/scripts/publicar_portfolio.sh`

No ejecutes esos comandos. Yo los correré manualmente y revisaré el resultado.
