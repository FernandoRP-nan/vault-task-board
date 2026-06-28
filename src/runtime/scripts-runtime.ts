import type { App } from "obsidian";
import { Notice } from "obsidian";

export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => SqlDatabase;
}

export interface SqlDatabase {
    run: (sql: string, params?: unknown) => void;
    exec: (sql: string) => void;
    prepare: (sql: string) => SqlStatement;
    export: () => Uint8Array;
    close: () => void;
}

export interface SqlStatement {
    bind: (params?: unknown) => boolean;
    step: () => boolean;
    get: () => unknown[];
    free: () => void;
}

export interface RuntimeConfigureOptions {
    sqlJsRel?: string;
    sqlWasmRel?: string;
}

let appRef: App | null = null;
let sqlJsRel = "";
let sqlWasmRel = "";
let sqlInstance: SqlJsStatic | null = null;
const binCache = new Map<string, Uint8Array>();

export function configureRuntime(app: App, opts: RuntimeConfigureOptions = {}): void {
    appRef = app;
    if (opts.sqlJsRel) sqlJsRel = opts.sqlJsRel;
    if (opts.sqlWasmRel) sqlWasmRel = opts.sqlWasmRel;
}

export const ScriptsRuntime = {
    SQL_JS_REL: "",
    SQL_WASM_REL: "",

    configure: (app: App, opts: RuntimeConfigureOptions = {}) => configureRuntime(app, opts),

    puedeUsarFs: (): boolean => {
        try {
            const adapter = appRef?.vault.adapter as { basePath?: string };
            return !!adapter?.basePath && !!require("fs");
        } catch {
            return false;
        }
    },

    rutaAbsoluta: (relPath: string): string => {
        const path = require("path");
        const adapter = appRef!.vault.adapter as unknown as { basePath: string };
        return path.join(adapter.basePath, relPath);
    },

    dirname: (relPath: string): string => {
        const i = relPath.lastIndexOf("/");
        return i > 0 ? relPath.slice(0, i) : "";
    },

    ensureDirAsync: async (relDir: string): Promise<void> => {
        if (!relDir || !appRef) return;
        const adapter = appRef.vault.adapter;
        const partes = relDir.split("/");
        let acc = "";
        for (const parte of partes) {
            acc = acc ? `${acc}/${parte}` : parte;
            if (!(await adapter.exists(acc))) await adapter.mkdir(acc);
        }
    },

    ensureDirSync: (relPath: string): void => {
        if (!ScriptsRuntime.puedeUsarFs()) return;
        const fs = require("fs");
        const path = require("path");
        const dir = path.dirname(ScriptsRuntime.rutaAbsoluta(relPath));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    },

    existeAsync: async (relPath: string): Promise<boolean> => {
        if (ScriptsRuntime.puedeUsarFs()) {
            return require("fs").existsSync(ScriptsRuntime.rutaAbsoluta(relPath));
        }
        return appRef!.vault.adapter.exists(relPath);
    },

    existeSync: (relPath: string): boolean => {
        if (ScriptsRuntime.puedeUsarFs()) {
            return require("fs").existsSync(ScriptsRuntime.rutaAbsoluta(relPath));
        }
        return binCache.has(relPath);
    },

    leerBinarioAsync: async (relPath: string): Promise<Uint8Array | null> => {
        if (await ScriptsRuntime.existeAsync(relPath)) {
            const buf = await appRef!.vault.adapter.readBinary(relPath);
            const data = new Uint8Array(buf);
            binCache.set(relPath, data);
            return data;
        }
        return null;
    },

    leerBinarioSync: (relPath: string): Uint8Array | null => {
        if (ScriptsRuntime.puedeUsarFs()) {
            const abs = ScriptsRuntime.rutaAbsoluta(relPath);
            if (!require("fs").existsSync(abs)) return null;
            const data = new Uint8Array(require("fs").readFileSync(abs));
            binCache.set(relPath, data);
            return data;
        }
        return binCache.get(relPath) ?? null;
    },

    escribirBinarioAsync: async (relPath: string, bytes: Uint8Array): Promise<void> => {
        await ScriptsRuntime.ensureDirAsync(ScriptsRuntime.dirname(relPath));
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        if (await appRef!.vault.adapter.exists(relPath)) {
            await appRef!.vault.adapter.writeBinary(relPath, buf);
        } else {
            await appRef!.vault.createBinary(relPath, buf);
        }
        binCache.set(relPath, bytes);
    },

    migrarArchivoBinario: async (legacyRel: string, newRel: string): Promise<boolean> => {
        if (!legacyRel || !newRel || legacyRel === newRel) return false;
        if (await ScriptsRuntime.existeAsync(newRel)) return false;
        if (!(await ScriptsRuntime.existeAsync(legacyRel))) return false;
        const bytes = await ScriptsRuntime.leerBinarioAsync(legacyRel);
        if (!bytes?.length) return false;
        await ScriptsRuntime.escribirBinarioAsync(newRel, bytes);
        binCache.delete(legacyRel);
        return true;
    },

    guardarDb: (db: SqlDatabase, relPath: string): void => {
        const bytes = db.export();
        const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        binCache.set(relPath, data);

        if (ScriptsRuntime.puedeUsarFs()) {
            ScriptsRuntime.ensureDirSync(relPath);
            require("fs").writeFileSync(
                ScriptsRuntime.rutaAbsoluta(relPath),
                Buffer.from(data)
            );
            return;
        }

        ScriptsRuntime.escribirBinarioAsync(relPath, data).catch((err) => {
            console.error("Error guardando SQLite:", err);
            new Notice("❌ Error al guardar la base de datos.");
        });
    },

    abrirDb: (
        SQL: SqlJsStatic,
        relPath: string,
        preparar: (db: SqlDatabase, esNueva: boolean) => void
    ): SqlDatabase => {
        const bytes = ScriptsRuntime.leerBinarioSync(relPath);
        const esNueva = !bytes;
        const db = esNueva ? new SQL.Database() : new SQL.Database(bytes);
        preparar(db, esNueva);
        if (esNueva) ScriptsRuntime.guardarDb(db, relPath);
        return db;
    },

    initDb: async (
        SQL: SqlJsStatic,
        relPath: string,
        preparar: (db: SqlDatabase, esNueva: boolean) => void
    ): Promise<SqlDatabase> => {
        if (!ScriptsRuntime.puedeUsarFs()) {
            await ScriptsRuntime.leerBinarioAsync(relPath);
        }
        return ScriptsRuntime.abrirDb(SQL, relPath, preparar);
    },

    initSqlJs: async (): Promise<SqlJsStatic> => {
        if (sqlInstance) return sqlInstance;

        const jsRel = sqlJsRel || ScriptsRuntime.SQL_JS_REL;
        const wasmRel = sqlWasmRel || ScriptsRuntime.SQL_WASM_REL;
        if (!jsRel || !wasmRel) {
            throw new Error("ScriptsRuntime: faltan rutas sql.js (configure con sqlJsRel/sqlWasmRel).");
        }

        let wasmBinary: Uint8Array;
        let initFn: (opts: { locateFile: () => string; wasmBinary: Uint8Array }) => Promise<SqlJsStatic>;

        if (ScriptsRuntime.puedeUsarFs()) {
            const fs = require("fs");
            const absWasm = ScriptsRuntime.rutaAbsoluta(wasmRel);
            const absJs = ScriptsRuntime.rutaAbsoluta(jsRel);
            if (!fs.existsSync(absWasm) || !fs.existsSync(absJs)) {
                throw new Error(`Faltan sql.js en el plugin (${wasmRel}). Ejecuta npm run build.`);
            }
            wasmBinary = new Uint8Array(fs.readFileSync(absWasm));
            initFn = require(absJs);
        } else {
            const bin = await ScriptsRuntime.leerBinarioAsync(wasmRel);
            if (!bin) throw new Error(`No se encontró ${wasmRel} en el vault.`);
            wasmBinary = bin;
            if (!(await ScriptsRuntime.existeAsync(jsRel))) {
                throw new Error(`No se encontró ${jsRel} en el vault.`);
            }
            eval(await appRef!.vault.adapter.read(jsRel));
            initFn = (typeof (globalThis as Record<string, unknown>).initSqlJs !== "undefined"
                ? (globalThis as Record<string, unknown>).initSqlJs
                : require("module").exports) as typeof initFn;
        }

        sqlInstance = await initFn({ locateFile: () => "", wasmBinary });
        return sqlInstance;
    }
};

export function getSqlJsInstance(): SqlJsStatic | null {
    return sqlInstance;
}

export function setSqlJsInstance(sql: SqlJsStatic): void {
    sqlInstance = sql;
}
