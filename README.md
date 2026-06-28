# Task Board

Plugin local de Obsidian: tablero Kanban con proyectos, dependencias visuales y subtareas.

## Instalación local

> **Importante:** clona **fuera del vault** (evita indexar `node_modules`).

```bash
git clone https://github.com/FernandoRP-nan/vault-task-board.git
cd vault-task-board
npm install
npm run build   # genera main.js + assets/sql-wasm.*
```

Enlazar al vault:

```bash
VAULT="/ruta/a/tu/vault/.obsidian/plugins"
ln -sf /ruta/a/Obsidian-Plugins/vault-task-board "$VAULT/vault-task-board"
```

Activa **Task Board** antes que Social Agenda.

## Datos

| Qué | Ruta |
|-----|------|
| SQLite | `.obsidian/plugins-data/vault-task-board/kanban_tareas.db` |
| sql.js | `.obsidian/plugins/vault-task-board/assets/` (incluido en el plugin) |

Al actualizar desde v1.0, copia automática desde `.obsidian/scripts/kanban_tareas.db` si existe.

Ya **no** requiere `npm install sql.js` en `.obsidian/scripts/`.

## Uso

- Cinta lateral → icono tablero
- Comando → **Abrir tablero de tareas**

## API

Expone `TaskBoardBridge` para **Social Agenda**. Eventos: `vault-task-board:ready`, `vault-task-board:changed`.

## Desarrollo

```bash
npm run dev
npm run build
```
