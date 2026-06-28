# Task Board

Plugin local de Obsidian: tablero Kanban con proyectos, dependencias visuales y subtareas.

## Instalación local

> **Importante:** desarrolla **fuera del vault**. Si el repo con `node_modules` queda dentro de la bóveda, Obsidian puede colgarse al indexar.

### 1. Clonar (fuera del vault)

```bash
git clone https://github.com/FernandoRP-nan/vault-task-board.git
# Ejemplo: /mnt/datos/.../Obsidian-Plugins/vault-task-board
```

### 2. sql.js (una vez por vault)

```bash
cd /ruta/a/tu/vault/.obsidian/scripts
npm init -y
npm install sql.js
```

### 3. Compilar

```bash
cd /ruta/a/Obsidian-Plugins/vault-task-board
npm install
npm run build
```

### 4. Enlazar al vault

```bash
VAULT="/ruta/a/tu/vault/.obsidian/plugins"
ln -sf /ruta/a/Obsidian-Plugins/vault-task-board "$VAULT/vault-task-board"
```

### 5. Activar

Ajustes → Complementos de la comunidad → complementos instalados → **Task Board**.

Actívalo **antes** que Social Agenda (expone la API de tareas).

## Uso

- Icono de tablero en la cinta lateral
- Paleta de comandos → **Abrir tablero de tareas**

Datos: `.obsidian/scripts/kanban_tareas.db` (compatible con el monolito Scripts).

## API para otros plugins

Expone `TaskBoardBridge` en `window` y en `plugin.api`.

| Evento | Cuándo |
|--------|--------|
| `vault-task-board:ready` | Plugin cargado |
| `vault-task-board:changed` | Cambios en tareas |

**Social Agenda** consume esta API.

## Desarrollo

```bash
npm run dev    # watch
npm run build  # producción
```
