import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

/**
 * Update the build version in both index.html and sw.js
 * Usage: node scripts/version_update.js <version_string>
 */
function updateVersion() {
    const version = process.argv[2];
    if (!version) {
        console.error("Error: Please provide a version string as the first argument.");
        process.exit(1);
    }

    const shortVersion = version.substring(0, 7);
    console.log(`Updating build version to: ${shortVersion}`);

    // Files to update
    const swPath = path.join(rootDir, "sw.js");
    const htmlPath = path.join(rootDir, "index.html");

    // 1. Update sw.js
    if (fs.existsSync(swPath)) {
        let swContent = fs.readFileSync(swPath, "utf8");
        // Regex to find: const VERSION = "xxxxxxx"; OR const VERSION = 'xxxxxxx';
        const newSwContent = swContent.replace(
            /(const VERSION = ["'])[^"']+([^"']+["'];)/,
            `$1${shortVersion}$2`
        );
        fs.writeFileSync(swPath, newSwContent, "utf8");
        console.log(`Updated sw.js VERSION to ${shortVersion}`);
    } else {
        console.warn("Warning: sw.js not found.");
    }

    // 2. Update index.html
    if (fs.existsSync(htmlPath)) {
        let htmlContent = fs.readFileSync(htmlPath, "utf8");
        // Regex to find: <p id="build-meta" class="build-meta">Build xxxxxxx</p>
        const newHtmlContent = htmlContent.replace(
            /(<p id="build-meta" class="build-meta">Build )[^<]+(<\/p>)/,
            `$1${shortVersion}$2`
        );
        fs.writeFileSync(htmlPath, newHtmlContent, "utf8");
        console.log(`Updated index.html build-meta to ${shortVersion}`);
    } else {
        console.warn("Warning: index.html not found.");
    }
}

updateVersion();
