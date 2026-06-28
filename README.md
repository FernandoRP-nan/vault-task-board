# Task Board

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Complemento local para [Obsidian](https://obsidian.md) que añade un tablero Kanban con proyectos, dependencias entre tareas, subtareas e imágenes adjuntas. Los datos se guardan en SQLite dentro de tu vault; no se envía información a servidores externos.

## Características

- Columnas **Por hacer**, **En proceso** y **Terminado** con arrastrar y soltar.
- Proyectos con archivo y restauración.
- Dependencias visuales entre tareas (mapa de requisitos).
- Subtareas por tarea.
- API pública para otros complementos (`TaskBoardBridge`).

## Requisitos

- Obsidian 1.5.0 o superior.
- Node.js 18+ (solo para compilar desde el código fuente).

## Instalación

### Opción A — Compilar desde el repositorio

1. Clona este repo **fuera** de tu vault (recomendado):

   ```bash
   git clone https://github.com/FernandoRP-nan/vault-task-board.git
   cd vault-task-board
   npm install
   npm run build
   ```

2. Enlaza o copia la carpeta en tu vault:

   ```bash
   ln -sf "$(pwd)" /ruta/a/tu/vault/.obsidian/plugins/vault-task-board
   ```

3. En Obsidian: **Ajustes → Complementos de la comunidad → Complementos instalados** → activa **Task Board**.

### Opción B — Release precompilado

Descarga `main.js`, `manifest.json` y la carpeta `assets/` del [último release](https://github.com/FernandoRP-nan/vault-task-board/releases) y colócalos en:

```
tu-vault/.obsidian/plugins/vault-task-board/
```

## Uso

- Icono de tablero en la cinta lateral.
- Paleta de comandos → **Abrir tablero de tareas**.

## Datos y privacidad

| Elemento | Ubicación en el vault |
|----------|------------------------|
| Base de datos | `.obsidian/plugins-data/vault-task-board/kanban_tareas.db` |
| Motor SQLite (sql.js) | `.obsidian/plugins/vault-task-board/assets/` |

Si existía una base en `.obsidian/scripts/kanban_tareas.db`, se copia automáticamente al activar el complemento por primera vez.

## Complementos relacionados

- [Social Agenda](https://github.com/FernandoRP-nan/vault-social-agenda) — sincroniza actividades sociales con este tablero (requiere Task Board activo).

## Desarrollo

```bash
npm run dev    # compilación en watch
npm run build  # producción
```

## Licencia

[MIT](LICENSE) — Copyright (c) 2026 FernandoRP-nan.
