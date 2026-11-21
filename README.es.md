# Limpiador de chats

[English](README.md) · **Español**

Extensión para navegadores basados en Chromium (Chrome, Edge, Brave) que borra en lote las conversaciones de **ChatGPT**, **Gemini** y **Claude** y conserva las que tienes fijadas o marcadas como favoritas.

Trabaja haciendo clic en la propia interfaz web del servicio, dentro de la pestaña abierta y con tu sesión habitual. No usa servidores ni guarda datos: solo pide los permisos `activeTab` y `scripting`, que se activan cuando pulsas el icono de la extensión.

> ⚠️ Borrar un chat es irreversible. Revisa la lista antes de confirmar.

## Instalación

1. Descarga este repositorio: **Code → Download ZIP** y descomprímelo, o clónalo:
   ```
   git clone https://github.com/opcionmatematica-creator/chat-cleaner.git
   ```
2. Abre la página de extensiones del navegador:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Activa **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** (o **Cargar desempaquetada**) y elige la carpeta que contiene `manifest.json`.

Funciona igual en Windows, macOS y Linux.

## Uso

1. Abre ChatGPT, Gemini o Claude con tu sesión iniciada y deja visible el historial de chats en la barra lateral.
2. Pulsa el icono **Limpiador de chats** en el menú de extensiones. Se abre un panel en la esquina de la página.
3. Pulsa **Calibrar menú** y haz clic en el botón **⋯** de cualquier chat del historial. Así el panel aprende qué botón abre el menú de cada fila.
4. Pulsa **Revisar chats**. El panel abre el menú de cada chat y lo clasifica:
   - **protegido**: está fijado o es favorito. Nunca se selecciona.
   - **no fijado**: se puede borrar.
   - **verifica si es favorito** (solo Claude): márcalo a mano solo si lo reconoces.
5. Pulsa **Seleccionar no fijados** y desmarca los chats que quieras conservar.
6. Pulsa **Borrar seleccionados**, escribe `BORRAR` y pulsa **Confirmar borrado**.

Pulsa **Cancelar** o la tecla **Esc** para detener cualquier operación.

> **Deja la pestaña a la vista hasta que termine.** Borrar muchos chats tarda varios minutos. Si cambias de pestaña, de ventana o de programa, el lote se detiene por seguridad. Para continuar, vuelve, pulsa **Revisar chats** y borra de nuevo: solo se procesan los chats que quedan.

### Qué revisa en cada servicio

- El panel recorre todo el historial de la barra lateral y carga los chats antiguos automáticamente.
- **Claude**: la barra lateral solo muestra los chats recientes. Para los antiguos, abre **Chats** (`claude.ai/recents`) y repite el proceso allí.
- Los chats dentro de **proyectos** y los **archivados** quedan fuera.

## Seguridad

Antes de borrar cada chat, la extensión vuelve a abrir su menú y comprueba que sigue sin estar fijado. Si la fila cambió, desapareció o aparece una ventana inesperada, omite ese chat o detiene el lote.

## Limitaciones

La extensión reconoce los menús por sus textos en español e inglés. Si un servicio cambia su interfaz, puede dejar de reconocer los botones; en ese caso el panel omite los chats en lugar de borrarlos.

Para aplicar una actualización: descarga la nueva versión, pulsa **Actualizar** en la página de extensiones y recarga la pestaña del servicio.

## Ayuda de cada servicio

- [ChatGPT: chats fijados](https://help.openai.com/en/articles/6825453-how-do-i-use-chatgpt-with-browsing)
- [Gemini: gestionar chats recientes y fijados](https://support.google.com/gemini/answer/13666746)
- [Claude: borrar o renombrar conversaciones](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation)
