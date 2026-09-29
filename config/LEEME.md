# `directo/config/escenas.json` — matriz de escenas × categoría

Configuración editable, en Git (a diferencia de `directo/data/`, que es estado de ejecución
ignorado). La consumen (cuando exista, paso 4 de la cadena) los overlays de
la carpeta `webhtml/` de tus medios de OBS a través de un futuro `/api/escena`, igual que hoy consumen
`/api/categoria` desde `directo/src/server.js`.

## Dos ejes ortogonales (decisión de Javier, 2026-09-16)

- **Categoría de actividad** (`directo/src/categorias.js`): `arte`, `musica`, `apps`, y la nueva
  `andando` del modo paseo.
- **Escena/fase del directo** (este fichero): `inicio`, `trabajando`, `hablando`, `espera`, `final`.

Cada escena tiene una paleta distinta por categoría — no es una lista plana de 5 colores.

## Por qué esta estructura de campos

Investigado el 2026-09-16 (ver fuentes abajo): no hay un estándar único de "theme.json" para
overlays de streaming — StreamElements/Streamlabs gestionan el color desde su propia UI, sin JSON
público documentado. El patrón de "objeto `palette` anidado con colores + bandera de tema" que sí
está documentado (theming de SharePoint, Streamlit) es el que se sigue aquí, adaptado a las claves
en español que ya usa `categorias.js` (`primario`/`secundario`/`oscuro`) para no introducir una
segunda convención de nombres en el mismo proyecto.

Fuentes consultadas:
- [Overlays: The Complete Guide – StreamElements](https://support.streamelements.com/hc/en-us/articles/10474479981074-Overlays-The-Complete-Guide-Gallery-OBS-Setup-Widgets-Alerts-Data)
- [SharePoint site theming JSON schema – Microsoft Learn](https://learn.microsoft.com/en-us/sharepoint/dev/declarative-customization/site-theming/sharepoint-site-theming-json-schema)

## Mapeo escena → colección de OBS y HTML — sin confirmar con Javier

Aproximado a partir del inventario de `Coleccion_de_escenas-reparada-2026-09-10.json` y de
`OBS/webhtml/LEEME.md`. Cada entrada de `escenas.json` lleva su propio `confianza_mapeo` porque
ninguno de estos cruces está confirmado todavía:

| Escena | Escena OBS aproximada | HTML overlay |
| :--- | :--- | :--- |
| inicio | `UniversoErBola` | `08-pantalla-inicio.html` |
| trabajando | `Solo_Calca` | `02-marco-tv.html` |
| hablando | `CON_CAMARA`, `chatEscena` | `03-marco-cam.html`, `04-marco-chat.html` |
| espera | `ModoEspera`, `PAUSA` | `06-pantalla-pausa.html` |
| final | *(no existe)* | *(no existe)* |

## Pendiente antes de dar el esquema por cerrado

1. **`final`**: no hay escena de OBS ni HTML dedicado. No se ha inventado contenido — Javier decide
   si se crea uno nuevo.
2. **`andando`**: la categoría queda reservada (`null` en las 5 escenas) hasta que
   `cl--tts-apliarte--modo-paseo-1-estudio-escenas-por-categoria` defina su paleta.
3. **`apps` → `desarrollo-de-software`**: cuando se ejecute ese renombrado pendiente (decisión de
   Javier del 2026-09-15, aún no aplicada en código), esta clave debe renombrarse a la vez en
   `escenas.json`, `categorias.js` y el estado guardado — no antes, para no desincronizar el sistema
   en vivo.
4. Los cinco mapeos escena→OBS/HTML de la tabla anterior son una hipótesis de trabajo, no un hecho
   verificado con Javier.
