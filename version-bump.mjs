import { readFileSync, writeFileSync } from "fs";

const args = process.argv.slice(2);
const bumpType = args[0];

if (!bumpType || !["major", "minor", "patch"].includes(bumpType)) {
	console.error("Usage: node version-bump.mjs <major|minor|patch>");
	process.exit(1);
}

const manifest = JSON.parse(readFileSync("src/manifest.json", "utf-8"));
const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
const versionsJson = JSON.parse(readFileSync("versions.json", "utf-8"));

const [major, minor, patch] = manifest.version.split(".").map(Number);

let newMajor = major;
let newMinor = minor;
let newPatch = patch;

if (bumpType === "major") {
	newMajor++;
	newMinor = 0;
	newPatch = 0;
} else if (bumpType === "minor") {
	newMinor++;
	newPatch = 0;
} else {
	newPatch++;
}

const newVersion = `${newMajor}.${newMinor}.${newPatch}`;

manifest.version = newVersion;
packageJson.version = newVersion;
versionsJson[newVersion] = manifest.minAppVersion;

writeFileSync("src/manifest.json", JSON.stringify(manifest, null, "\t") + "\n");
writeFileSync("package.json", JSON.stringify(packageJson, null, "\t") + "\n");
writeFileSync("versions.json", JSON.stringify(versionsJson, null, "\t") + "\n");

console.log(`Bumped version to ${newVersion}`);