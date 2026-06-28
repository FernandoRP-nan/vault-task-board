/* scripts_runtime.js - I/O del vault compatible con Obsidian móvil y escritorio */

window.ScriptsRuntime = {
    SQL_JS_REL: ".obsidian/scripts/node_modules/sql.js/dist/sql-wasm.js",
    SQL_WASM_REL: ".obsidian/scripts/node_modules/sql.js/dist/sql-wasm.wasm",

    _app: null,
    _binCache: new Map(),

    configure: (app) => {
        window.ScriptsRuntime._app = app;
    },

    // Escritorio: fs + basePath. Móvil: adapter del vault.
    puedeUsarFs: () => {
        try {
            const base = window.ScriptsRuntime._app?.vault?.adapter?.basePath;
            return !!base && !!require("fs");
        } catch (_) {
            return false;
        }
    },

    rutaAbsoluta: (relPath) => {
        const path = require("path");
        return path.join(window.ScriptsRuntime._app.vault.adapter.basePath, relPath);
    },

    dirname: (relPath) => {
        const i = relPath.lastIndexOf("/");
        return i > 0 ? relPath.slice(0, i) : "";
    },

    ensureDirAsync: async (relDir) => {
        if (!relDir) return;
        const adapter = window.ScriptsRuntime._app.vault.adapter;
        const partes = relDir.split("/");
        let acc = "";
        for (const parte of partes) {
            acc = acc ? `${acc}/${parte}` : parte;
            if (!(await adapter.exists(acc))) await adapter.mkdir(acc);
        }
    },

    ensureDirSync: (relPath) => {
        if (!window.ScriptsRuntime.puedeUsarFs()) return;
        const fs = require("fs");
        const path = require("path");
        const dir = path.dirname(window.ScriptsRuntime.rutaAbsoluta(relPath));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    },

    existeAsync: async (relPath) => {
        if (window.ScriptsRuntime.puedeUsarFs()) {
            return require("fs").existsSync(window.ScriptsRuntime.rutaAbsoluta(relPath));
        }
        return window.ScriptsRuntime._app.vault.adapter.exists(relPath);
    },

    existeSync: (relPath) => {
        if (window.ScriptsRuntime.puedeUsarFs()) {
            return require("fs").existsSync(window.ScriptsRuntime.rutaAbsoluta(relPath));
        }
        return window.ScriptsRuntime._binCache.has(relPath);
    },

    leerBinarioAsync: async (relPath) => {
        if (await window.ScriptsRuntime.existeAsync(relPath)) {
            const buf = await window.ScriptsRuntime._app.vault.adapter.readBinary(relPath);
            const data = new Uint8Array(buf);
            window.ScriptsRuntime._binCache.set(relPath, data);
            return data;
        }
        return null;
    },

    leerBinarioSync: (relPath) => {
        if (window.ScriptsRuntime.puedeUsarFs()) {
            const abs = window.ScriptsRuntime.rutaAbsoluta(relPath);
            if (!require("fs").existsSync(abs)) return null;
            const data = new Uint8Array(require("fs").readFileSync(abs));
            window.ScriptsRuntime._binCache.set(relPath, data);
            return data;
        }
        return window.ScriptsRuntime._binCache.get(relPath) || null;
    },

    escribirBinarioAsync: async (relPath, bytes) => {
        const app = window.ScriptsRuntime._app;
        await window.ScriptsRuntime.ensureDirAsync(window.ScriptsRuntime.dirname(relPath));
        if (await app.vault.adapter.exists(relPath)) {
            await app.vault.adapter.writeBinary(relPath, bytes);
        } else {
            await app.vault.createBinary(relPath, bytes);
        }
        window.ScriptsRuntime._binCache.set(relPath, bytes);
    },

    guardarDb: (db, relPath) => {
        const bytes = db.export();
        const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        window.ScriptsRuntime._binCache.set(relPath, data);

        if (window.ScriptsRuntime.puedeUsarFs()) {
            window.ScriptsRuntime.ensureDirSync(relPath);
            require("fs").writeFileSync(
                window.ScriptsRuntime.rutaAbsoluta(relPath),
                Buffer.from(data)
            );
            return;
        }

        window.ScriptsRuntime.escribirBinarioAsync(relPath, data).catch((err) => {
            console.error("Error guardando SQLite:", err);
            new (require("obsidian").Notice)("❌ Error al guardar la base de datos.");
        });
    },

    abrirDb: (SQL, relPath, preparar) => {
        const bytes = window.ScriptsRuntime.leerBinarioSync(relPath);
        const esNueva = !bytes;
        const db = esNueva ? new SQL.Database() : new SQL.Database(bytes);
        preparar(db, esNueva);
        if (esNueva) window.ScriptsRuntime.guardarDb(db, relPath);
        return db;
    },

    initDb: async (SQL, relPath, preparar) => {
        if (!window.ScriptsRuntime.puedeUsarFs()) {
            await window.ScriptsRuntime.leerBinarioAsync(relPath);
        }
        return window.ScriptsRuntime.abrirDb(SQL, relPath, preparar);
    },

    initSqlJs: async () => {
        if (window.SqlJsInstance) return window.SqlJsInstance;

        const jsRel = window.ScriptsRuntime.SQL_JS_REL;
        const wasmRel = window.ScriptsRuntime.SQL_WASM_REL;
        let wasmBinary;
        let initFn;

        if (window.ScriptsRuntime.puedeUsarFs()) {
            const fs = require("fs");
            const absWasm = window.ScriptsRuntime.rutaAbsoluta(wasmRel);
            const absJs = window.ScriptsRuntime.rutaAbsoluta(jsRel);
            if (!fs.existsSync(absWasm) || !fs.existsSync(absJs)) {
                throw new Error(`Faltan sql.js en ${wasmRel}`);
            }
            wasmBinary = new Uint8Array(fs.readFileSync(absWasm));
            initFn = require(absJs);
        } else {
            wasmBinary = await window.ScriptsRuntime.leerBinarioAsync(wasmRel);
            if (!wasmBinary) throw new Error(`No se encontró ${wasmRel} en el vault.`);
            if (!(await window.ScriptsRuntime.existeAsync(jsRel))) {
                throw new Error(`No se encontró ${jsRel} en el vault.`);
            }
            eval(await window.ScriptsRuntime._app.vault.adapter.read(jsRel));
            initFn = typeof initSqlJs !== "undefined" ? initSqlJs : module.exports;
        }

        const SQL = await initFn({ locateFile: () => "", wasmBinary });
        window.SqlJsInstance = SQL;
        return SQL;
    }
};
