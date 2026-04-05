import { readFileSync, existsSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

/**
 * Build an absolute file path from a project-relative path.
 *
 * Parameters:
 * - relativePath {string}: Path relative to the project root.
 *
 * Returns:
 * - {string}: Absolute path on disk.
 *
 * Raises:
 * - {TypeError}: When the input path is not a string.
 */
function toAbsolutePath(relativePath) {
    if (typeof relativePath !== 'string') {
        throw new TypeError('Expected a string path value.');
    }
    return resolve(projectRoot, relativePath);
}

/**
 * Extract local JavaScript module import paths from source text.
 *
 * Parameters:
 * - sourceText {string}: JavaScript source code.
 *
 * Returns:
 * - {string[]}: A list of local import specifiers beginning with `./` or `../`.
 *
 * Raises:
 * - {TypeError}: When the source text is not a string.
 */
function extractLocalImports(sourceText) {
    if (typeof sourceText !== 'string') {
        throw new TypeError('Expected sourceText to be a string.');
    }

    const importPattern = /(?:import\s+(?:[^'";]+?\s+from\s+)?|import\s*\()\s*['\"]([^'\"]+)['\"]/g;
    const imports = [];
    let match = importPattern.exec(sourceText);

    while (match) {
        const specifier = match[1];
        if (specifier.startsWith('./') || specifier.startsWith('../')) {
            imports.push(specifier);
        }
        match = importPattern.exec(sourceText);
    }

    return imports;
}

/**
 * Validate that all module imports in a JavaScript file resolve to existing files.
 *
 * Parameters:
 * - relativeFilePath {string}: JavaScript file path relative to project root.
 *
 * Returns:
 * - {string[]}: Missing import errors for this file.
 *
 * Raises:
 * - {Error}: When the target file cannot be read.
 */
function validateJavaScriptImports(relativeFilePath) {
    const absoluteFilePath = toAbsolutePath(relativeFilePath);
    const sourceText = readFileSync(absoluteFilePath, 'utf8');
    const importSpecifiers = extractLocalImports(sourceText);

    return importSpecifiers
        .map((specifier) => {
            const resolvedImportPath = resolve(dirname(absoluteFilePath), specifier);
            const hasExtension = Boolean(extname(resolvedImportPath));
            const candidates = hasExtension
                ? [resolvedImportPath]
                : [
                    `${resolvedImportPath}.js`,
                    `${resolvedImportPath}.mjs`,
                    `${resolvedImportPath}.cjs`,
                    resolve(resolvedImportPath, 'index.js'),
                ];

            if (candidates.some((candidate) => existsSync(candidate))) {
                return null;
            }

            return `Missing import in ${relativeFilePath}: ${specifier}`;
        })
        .filter(Boolean);
}

/**
 * Validate that all local script tags in index.html point to existing files.
 *
 * Parameters:
 * - htmlRelativePath {string}: HTML path relative to project root.
 *
 * Returns:
 * - {string[]}: Missing script source errors for this HTML file.
 *
 * Raises:
 * - {Error}: When the HTML file cannot be read.
 */
function validateHtmlScripts(htmlRelativePath) {
    const absoluteHtmlPath = toAbsolutePath(htmlRelativePath);
    const htmlText = readFileSync(absoluteHtmlPath, 'utf8');
    const scriptPattern = /<script[^>]*\ssrc=["']([^"']+)["'][^>]*>/g;
    const errors = [];
    let match = scriptPattern.exec(htmlText);

    while (match) {
        const sourcePath = match[1];
        if (!sourcePath.startsWith('http') && !sourcePath.startsWith('//')) {
            const normalizedPath = sourcePath.replace(/^\.\//, '');
            if (!existsSync(toAbsolutePath(normalizedPath))) {
                errors.push(`Missing script src in ${htmlRelativePath}: ${sourcePath}`);
            }
        }
        match = scriptPattern.exec(htmlText);
    }

    return errors;
}

const filesToValidate = [
    'app.js',
    'analytics.js',
    'api.js',
    'auth.js',
    'db.js',
    'export-utils.js',
    'state.js',
    'ui-utils.js',
    'analytics/intervals.js',
    'analytics/segments.js',
    'analytics/trends.js',
    'analytics/weather.js',
    'components/calendar.js',
    'components/charts.js',
    'components/dashboard.js',
    'components/pb-gallery.js',
    'components/runs-list.js',
    'controllers/auth-controller.js',
    'controllers/data-controller.js',
    'controllers/ui-controller.js',
    'models/physio.js',
    'utils/format.js',
    'utils/math.js',
    'workers/enrichment.js',
];

const errors = [
    ...validateHtmlScripts('index.html'),
    ...filesToValidate.flatMap((filePath) => validateJavaScriptImports(filePath)),
];

if (errors.length > 0) {
    console.error('Refactor sanity check failed:');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
}

console.log('Refactor sanity check passed. All local module imports and script references resolve.');
