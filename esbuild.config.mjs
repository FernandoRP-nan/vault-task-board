import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";

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

if (prod) {
  await ctx.rebuild();
  process.exit(0);
}
await ctx.watch();
