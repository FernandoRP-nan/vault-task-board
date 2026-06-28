import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import "./legacy";

const PLUGIN_ID = "vault-task-board";
const PLUGIN_ROOT = `.obsidian/plugins/${PLUGIN_ID}`;
const LEGACY_DB = ".obsidian/scripts/kanban_tareas.db";

declare global {
    interface Window {
        ScriptsRuntime: {
            configure: (app: unknown, opts?: { sqlJsRel?: string; sqlWasmRel?: string }) => void;
            initSqlJs: () => Promise<unknown>;
            puedeUsarFs: () => boolean;
            leerBinarioAsync: (path: string) => Promise<Uint8Array | null>;
            migrarArchivoBinario: (legacy: string, dest: string) => Promise<boolean>;
        };
        KanbanDB: {
            DB_RELATIVE: string;
            init: (SQL: unknown, dbPath: string) => Promise<unknown>;
        };
        KanbanUI: {
            injectStyles: () => void;
            renderDashboard: (
                container: HTMLElement,
                db: unknown,
                dbPath: string,
                proyectoFiltro: string,
                setProyectoFiltro: (p: string) => void,
                mostrarBloqueadas: boolean,
                setMostrarBloqueadas: (v: boolean) => void,
                mostrarCompletadas: boolean,
                setMostrarCompletadas: (v: boolean) => void
            ) => Promise<void>;
        };
        TaskBoardBridgeFactory: (fn: () => unknown) => TaskBoardApi;
        TaskBoardBridge?: TaskBoardApi;
    }
}

export interface TaskBoardApi {
    PLUGIN_ID: string;
    isAvailable: () => boolean;
    dbPath: () => string;
    notaConMarcaAgenda: (notas: string, agendaId: string) => string;
    buscarIdPorAgendaId: (agendaId: string) => number | null | undefined;
    obtenerTodas: () => Array<{ id: number; estado: string }>;
    crearTarea: (datos: Record<string, unknown>) => number;
    actualizarTarea: (tareaId: number, datos: Record<string, unknown>) => number | undefined;
    eliminarTarea: (tareaId: number) => void;
    emitChange: (app: unknown) => void;
}

export const VIEW_TYPE = "vault-task-board-dashboard";

export default class TaskBoardPlugin extends Plugin {
    api!: TaskBoardApi;
    private sql: unknown = null;
    private ready = false;

    async onload(): Promise<void> {
        window.ScriptsRuntime.configure(this.app, {
            sqlJsRel: `${PLUGIN_ROOT}/assets/sql-wasm.js`,
            sqlWasmRel: `${PLUGIN_ROOT}/assets/sql-wasm.wasm`
        });

        const dbPath = window.KanbanDB.DB_RELATIVE;
        if (await window.ScriptsRuntime.migrarArchivoBinario(LEGACY_DB, dbPath)) {
            new Notice("Task Board: base de datos migrada a plugins-data.");
        }

        this.api = window.TaskBoardBridgeFactory(() => this.sql);
        window.TaskBoardBridge = this.api;

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

    onunload(): void {
        if (window.TaskBoardBridge === this.api) {
            delete window.TaskBoardBridge;
        }
    }

    async ensureSql(): Promise<unknown> {
        if (!this.sql) {
            this.sql = await window.ScriptsRuntime.initSqlJs();
            this.ready = true;
        }
        return this.sql;
    }

    private async activateView(): Promise<void> {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
        if (!leaf) {
            leaf = workspace.getLeaf(true);
            await leaf.setViewState({ type: VIEW_TYPE, active: true });
        }
        workspace.revealLeaf(leaf);
    }
}

class TaskBoardView extends ItemView {
    private proyectoFiltro = "";
    private mostrarBloqueadas = true;
    private mostrarCompletadas = true;

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
            // @ts-expect-error evento personalizado entre plugins locales
            this.app.workspace.on("vault-task-board:changed", () => this.render())
        );
    }

    async onClose(): Promise<void> {
        this.containerEl.empty();
    }

    private async render(): Promise<void> {
        const root = this.containerEl;
        root.empty();
        root.addClass("vault-task-board-root");

        try {
            const SQL = await this.plugin.ensureSql();
            const dbPath = window.KanbanDB.DB_RELATIVE;
            if (!window.ScriptsRuntime.puedeUsarFs()) {
                await window.ScriptsRuntime.leerBinarioAsync(dbPath);
            }
            let db = await window.KanbanDB.init(SQL, dbPath);
            window.KanbanUI.injectStyles();

            const ejecutar = async () => {
                db = await window.KanbanDB.init(SQL, dbPath);
                root.empty();
                await window.KanbanUI.renderDashboard(
                    root, db, dbPath,
                    this.proyectoFiltro,
                    (p) => { this.proyectoFiltro = p; void ejecutar(); },
                    this.mostrarBloqueadas,
                    (v) => { this.mostrarBloqueadas = v; void ejecutar(); },
                    this.mostrarCompletadas,
                    (v) => { this.mostrarCompletadas = v; void ejecutar(); }
                );
                window.TaskBoardBridge?.emitChange(this.app);
            };
            await ejecutar();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            root.createEl("p", { text: `❌ Error: ${msg}` });
            new Notice("Task Board: error al cargar.");
        }
    }
}
