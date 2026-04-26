import esbuild from "esbuild";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.argv.includes("--production");

await esbuild.build({
	entryPoints: [path.join(__dirname, "src/main.ts")],
	outfile: path.join(__dirname, "dist/main.js"),
	bundle: true,
	platform: "node",
	target: "es2020",
	format: "cjs",
	sourcemap: !isProduction,
	minify: isProduction,
	external: ["obsidian", "electron"],
	define: {
		"process.env.NODE_ENV": isProduction ? '"production"' : '"development"',
	},
});

fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.copyFileSync(
	path.join(__dirname, "src/manifest.json"),
	path.join(__dirname, "dist/manifest.json")
);
fs.copyFileSync(
	path.join(__dirname, "src/styles.css"),
	path.join(__dirname, "dist/styles.css")
);
console.log("Build complete!");