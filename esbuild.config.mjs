import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { cpSync, mkdirSync } from "node:fs";

const prod = process.argv[2] === "production";

const ctx = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: ["obsidian", "electron", ...builtinModules],
    format: "cjs",
    target: "es2021",
    outfile: "main.js",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    logLevel: "info"
});

const copiarSqlJs = () => {
    mkdirSync("assets", { recursive: true });
    cpSync("node_modules/sql.js/dist/sql-wasm.wasm", "assets/sql-wasm.wasm");
    cpSync("node_modules/sql.js/dist/sql-wasm.js", "assets/sql-wasm.js");
};

if (prod) {
    await ctx.rebuild();
    copiarSqlJs();
    process.exit(0);
}

copiarSqlJs();
await ctx.watch();
