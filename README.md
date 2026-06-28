# Task Board

Plugin local de Obsidian: tablero Kanban con proyectos, dependencias visuales y subtareas.

## Instalación local

1. Clona o copia este repo en `.obsidian/plugins/vault-task-board/`.
2. Instala dependencias de sql.js en el vault (una sola vez):

```bash
mkdir -p .obsidian/scripts/node_modules
cd .obsidian/scripts
npm init -y
npm install sql.js
```

3. Compila el plugin:

```bash
cd .obsidian/plugins/vault-task-board
npm install
npm run build
```

4. Activa **Task Board** en Ajustes → Complementos de la comunidad → complementos instalados.

## Uso

- Icono de tablero en la cinta lateral, o comando **Abrir tablero de tareas**.
- Los datos viven en `.obsidian/scripts/kanban_tareas.db` (compatible con la versión anterior de Scripts).

## API para otros plugins

Este plugin expone `TaskBoardBridge` en `window` y en la instancia del plugin (`plugin.api`).

Eventos emitidos:

| Evento | Cuándo |
|--------|--------|
| `vault-task-board:ready` | Plugin cargado |
| `vault-task-board:changed` | Cambios en tareas |

**Social Agenda** consume esta API para sincronizar actividades tipo tarea.

## Desarrollo

```bash
npm run dev   # watch
npm run build # producción
```
