import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { ScriptsRuntime } from "./runtime/scripts-runtime";
import { KanbanDB } from "./lib/kanban_db";
import { KanbanUI } from "./lib/kanban_ui";
import { prepareScrollableView } from "./lib/view-scroll";
import { TaskBoardBridgeFactory } from "./lib/task-board-bridge";
import type { TaskBoardApi } from "./types";

import "./lib/kanban_modals";

const PLUGIN_ID = "vault-task-board";
const PLUGIN_ROOT = `.obsidian/plugins/${PLUGIN_ID}`;
const LEGACY_DB = ".obsidian/scripts/kanban_tareas.db";

export const VIEW_TYPE = "vault-task-board-dashboard";

export default class TaskBoardPlugin extends Plugin {
    api!: TaskBoardApi;

    async onload(): Promise<void> {
        ScriptsRuntime.configure(this.app, {
            sqlJsRel: `${PLUGIN_ROOT}/assets/sql-wasm.js`,
            sqlWasmRel: `${PLUGIN_ROOT}/assets/sql-wasm.wasm`
        });

        if (await ScriptsRuntime.migrarArchivoBinario(LEGACY_DB, KanbanDB.DB_RELATIVE)) {
            new Notice("Task Board: base de datos migrada a plugins-data.");
        }

        this.api = TaskBoardBridgeFactory(() => this.sql) as TaskBoardApi;

        this.registerView(VIEW_TYPE, (leaf) => new TaskBoardView(leaf, this));
        this.addRibbonIcon("layout-dashboard", "Task Board", () => this.activateView());
        this.addCommand({
            id: "open-dashboard",
            name: "Abrir tablero de tareas",
            callback: () => this.activateView()
        });

        this.app.workspace.onLayoutReady(() => {
            this.app.workspace.trigger("vault-task-board:ready" as never);
        });
    }

    private sql: unknown = null;

    async ensureSql(): Promise<unknown> {
        if (!this.sql) this.sql = await ScriptsRuntime.initSqlJs();
        return this.sql;
    }

    private async activateView(): Promise<void> {
        let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
        if (!leaf) {
            leaf = this.app.workspace.getLeaf(true);
            await leaf.setViewState({ type: VIEW_TYPE, active: true });
        }
        this.app.workspace.revealLeaf(leaf);
    }
}

class TaskBoardView extends ItemView {
    private proyectoFiltro = "";
    private mostrarBloqueadas = true;
    private mostrarCompletadas = true;
    private scrollHost: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, private plugin: TaskBoardPlugin) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Task Board";
    }

    getIcon(): string {
        return "layout-dashboard";
    }

    async onOpen(): Promise<void> {
        await this.render();
        this.registerEvent(
            // @ts-expect-error evento personalizado
            this.app.workspace.on("vault-task-board:changed", () => this.render())
        );
    }

    async onClose(): Promise<void> {
        this.scrollHost = null;
        this.containerEl.empty();
    }

    private getScrollRoot(): HTMLElement {
        if (!this.scrollHost?.isConnected) {
            this.scrollHost = prepareScrollableView(
                this,
                VIEW_TYPE,
                "vault-task-board-root"
            );
        }
        return this.scrollHost;
    }

    private async render(): Promise<void> {
        const root = this.getScrollRoot();
        root.empty();

        try {
            const SQL = await this.plugin.ensureSql();
            const dbPath = KanbanDB.DB_RELATIVE;
            if (!ScriptsRuntime.puedeUsarFs()) {
                await ScriptsRuntime.leerBinarioAsync(dbPath);
            }
            let db = await KanbanDB.init(SQL, dbPath);
            KanbanUI.injectStyles();

            const ejecutar = async () => {
                db = await KanbanDB.init(SQL, dbPath);
                root.empty();
                await KanbanUI.renderDashboard(
                    root, db, dbPath,
                    this.proyectoFiltro,
                    (p: string) => { this.proyectoFiltro = p; void ejecutar(); },
                    this.mostrarBloqueadas,
                    (v: boolean) => { this.mostrarBloqueadas = v; void ejecutar(); },
                    this.mostrarCompletadas,
                    (v: boolean) => { this.mostrarCompletadas = v; void ejecutar(); }
                );
                this.plugin.api.emitChange(this.app);
            };
            await ejecutar();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            root.createEl("p", { text: `❌ Error: ${msg}` });
            new Notice("Task Board: error al cargar.");
        }
    }
}

export type { TaskBoardApi };
