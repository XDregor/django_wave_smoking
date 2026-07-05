import { cpus } from "node:os";
import { extname, join, parse, resolve } from "node:path";
import { readdir, rename, rm, stat } from "node:fs/promises";
import sharp from "sharp";

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const SKIPPED_DIRECTORIES = new Set([".git", ".venv", "node_modules", "staticfiles"]);
const DEFAULT_ROOTS = ["main/static", "media", "products"];

function parsePositiveInteger(value, optionName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function parseArguments(argv) {
  const options = {
    write: false,
    replace: false,
    format: "preserve",
    maxWidth: 2560,
    maxHeight: 2560,
    quality: 84,
    minSavingsPercent: 1,
    concurrency: Math.max(1, Math.min(4, cpus().length)),
    help: false,
    roots: [],
  };

  for (const argument of argv) {
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--write") options.write = true;
    else if (argument === "--audit") options.write = false;
    else if (argument === "--replace") options.replace = true;
    else if (argument.startsWith("--format=")) options.format = argument.split("=", 2)[1].toLowerCase();
    else if (argument.startsWith("--max-width=")) options.maxWidth = parsePositiveInteger(argument.split("=", 2)[1], "--max-width");
    else if (argument.startsWith("--max-height=")) options.maxHeight = parsePositiveInteger(argument.split("=", 2)[1], "--max-height");
    else if (argument.startsWith("--quality=")) options.quality = parsePositiveInteger(argument.split("=", 2)[1], "--quality");
    else if (argument.startsWith("--min-savings=")) options.minSavingsPercent = parsePositiveInteger(argument.split("=", 2)[1], "--min-savings");
    else if (argument.startsWith("--concurrency=")) options.concurrency = parsePositiveInteger(argument.split("=", 2)[1], "--concurrency");
    else if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
    else options.roots.push(argument);
  }

  if (!new Set(["preserve", "webp", "avif"]).has(options.format)) {
    throw new Error("--format must be preserve, webp, or avif.");
  }
  if (options.quality > 100) throw new Error("--quality must not exceed 100.");
  if (options.replace && !options.write) throw new Error("--replace requires --write.");
  if (options.roots.length === 0) options.roots = DEFAULT_ROOTS;
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/optimize_images.mjs [paths...] [options]

Without --write the command performs a read-only audit.

Options:
  --write                 Write optimized files
  --format=preserve       Keep source formats (default)
  --format=webp|avif      Create the selected modern format
  --replace               Delete a source after successful conversion
  --max-width=2560        Maximum output width
  --max-height=2560       Maximum output height
  --quality=84            JPEG/WebP/AVIF quality, 1-100
  --min-savings=1         Skip files saving less than this percentage
  --concurrency=4         Maximum parallel image jobs
  --help                  Show this help`);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function collectImages(root, output) {
  if (!(await pathExists(root))) return;
  const rootStat = await stat(root);
  if (rootStat.isFile()) {
    if (SUPPORTED_EXTENSIONS.has(extname(root).toLowerCase())) output.push(root);
    return;
  }

  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) await collectImages(entryPath, output);
    else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) output.push(entryPath);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function targetExtension(sourceExtension, format) {
  if (format === "preserve") return sourceExtension;
  return `.${format}`;
}

function configureEncoder(pipeline, extension, quality) {
  if (extension === ".jpg" || extension === ".jpeg") {
    return pipeline.jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" });
  }
  if (extension === ".png") {
    return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  }
  if (extension === ".webp") {
    return pipeline.webp({ quality, alphaQuality: quality, effort: 6, smartSubsample: true });
  }
  if (extension === ".avif") {
    return pipeline.avif({ quality, effort: 6, chromaSubsampling: "4:4:4" });
  }
  throw new Error(`Unsupported output extension: ${extension}`);
}

async function inspectImage(filePath, options) {
  const fileStat = await stat(filePath);
  const metadata = await sharp(filePath, { failOn: "warning", limitInputPixels: false }).metadata();
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  const needsResize = width > options.maxWidth || height > options.maxHeight;
  return { filePath, fileStat, metadata, width, height, needsResize };
}

async function optimizeImage(image, options) {
  const sourceExtension = extname(image.filePath).toLowerCase();
  const outputExtension = targetExtension(sourceExtension, options.format);
  const parsedPath = parse(image.filePath);
  const targetPath = join(parsedPath.dir, `${parsedPath.name}${outputExtension}`);
  const temporaryPath = join(parsedPath.dir, `.${parsedPath.name}.optimize-${process.pid}-${Date.now()}${outputExtension}`);

  let pipeline = sharp(image.filePath, { failOn: "warning", limitInputPixels: false }).rotate();
  if (image.needsResize) {
    pipeline = pipeline.resize({
      width: options.maxWidth,
      height: options.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    });
  }
  pipeline = configureEncoder(pipeline, outputExtension, options.quality).withMetadata({ orientation: undefined });

  try {
    const outputInfo = await pipeline.toFile(temporaryPath);
    const outputStat = await stat(temporaryPath);
    const savingsPercent = ((image.fileStat.size - outputStat.size) / image.fileStat.size) * 100;
    const worthWriting = image.needsResize || savingsPercent >= options.minSavingsPercent;

    if (!worthWriting) {
      await rm(temporaryPath, { force: true });
      return { status: "skipped", ...image, outputInfo, outputSize: outputStat.size, savingsPercent };
    }

    if (targetPath === image.filePath) {
      await rm(image.filePath, { force: true });
    } else {
      await rm(targetPath, { force: true });
    }
    await rename(temporaryPath, targetPath);
    if (options.replace && targetPath !== image.filePath) await rm(image.filePath, { force: true });

    return { status: "optimized", ...image, targetPath, outputInfo, outputSize: outputStat.size, savingsPercent };
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        results[currentIndex] = await worker(items[currentIndex]);
      } catch (error) {
        results[currentIndex] = { status: "error", filePath: items[currentIndex], error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const images = [];
  for (const root of options.roots) await collectImages(resolve(root), images);
  const uniqueImages = [...new Set(images)].sort((left, right) => left.localeCompare(right));

  if (uniqueImages.length === 0) {
    console.log("No supported images found.");
    return;
  }

  if (options.format !== "preserve") {
    const outputOwners = new Map();
    for (const imagePath of uniqueImages) {
      const parsedPath = parse(imagePath);
      const outputPath = join(parsedPath.dir, `${parsedPath.name}.${options.format}`).toLowerCase();
      const existingOwner = outputOwners.get(outputPath);
      if (existingOwner && existingOwner !== imagePath) {
        throw new Error(`Output collision: ${existingOwner} and ${imagePath} both map to ${outputPath}.`);
      }
      outputOwners.set(outputPath, imagePath);
    }
  }

  const inspected = await runPool(uniqueImages, options.concurrency, (filePath) => inspectImage(filePath, options));
  const inspectionErrors = inspected.filter((item) => item.status === "error");
  const validImages = inspected.filter((item) => item.status !== "error");
  const totalBefore = validImages.reduce((sum, item) => sum + item.fileStat.size, 0);

  if (!options.write) {
    for (const image of validImages) {
      const marker = image.needsResize ? "RESIZE" : "OK";
      console.log(`${marker.padEnd(6)} ${image.width}x${image.height} ${formatBytes(image.fileStat.size).padStart(9)}  ${image.filePath}`);
    }
    console.log(`\nAudit: ${validImages.length} images, ${formatBytes(totalBefore)} total.`);
    console.log("No files changed. Add --write to optimize.");
  } else {
    const results = await runPool(validImages, options.concurrency, (image) => optimizeImage(image, options));
    let totalAfter = 0;
    let optimizedCount = 0;
    for (const result of results) {
      if (result.status === "optimized") {
        optimizedCount += 1;
        totalAfter += result.outputSize;
        console.log(`WRITE  ${formatBytes(result.fileStat.size)} -> ${formatBytes(result.outputSize)} (${result.savingsPercent.toFixed(1)}%)  ${result.targetPath}`);
      } else if (result.status === "skipped") {
        totalAfter += result.fileStat.size;
        console.log(`SKIP   ${result.filePath}`);
      } else {
        totalAfter += result.fileStat?.size ?? 0;
        console.error(`ERROR  ${result.filePath}: ${result.error.message}`);
      }
    }
    console.log(`\nOptimized ${optimizedCount}/${validImages.length} images.`);
    console.log(`Total: ${formatBytes(totalBefore)} -> ${formatBytes(totalAfter)} (${((1 - totalAfter / totalBefore) * 100).toFixed(1)}% smaller).`);
  }

  for (const failure of inspectionErrors) console.error(`ERROR  ${failure.filePath}: ${failure.error.message}`);
  if (inspectionErrors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
