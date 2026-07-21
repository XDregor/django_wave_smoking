from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from PIL import Image, ImageOps


SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
SKIPPED_DIRECTORIES = {".git", ".venv", "node_modules", "staticfiles", "__pycache__"}
RESPONSIVE_WIDTHS = (360, 640, 960, 1280, 1920)


class Command(BaseCommand):
    help = "Audit or optimize local project images with Pillow."

    def add_arguments(self, parser):
        parser.add_argument(
            "paths",
            nargs="*",
            help="Files or directories to scan. Defaults to MEDIA_ROOT and main/static.",
        )
        parser.add_argument("--write", action="store_true", help="Write optimized files.")
        parser.add_argument(
            "--format",
            choices=("preserve", "webp"),
            default="preserve",
            help="Output format. Default keeps source extension.",
        )
        parser.add_argument("--replace", action="store_true", help="Delete source after converting to another format.")
        parser.add_argument("--max-width", type=int, default=2560)
        parser.add_argument("--max-height", type=int, default=2560)
        parser.add_argument("--quality", type=int, default=84)
        parser.add_argument("--responsive", action="store_true", help="Create responsive WebP sidecar files.")
        parser.add_argument(
            "--responsive-widths",
            default=",".join(str(width) for width in RESPONSIVE_WIDTHS),
            help="Comma-separated responsive widths, used with --responsive.",
        )

    def handle(self, *args, **options):
        if options["replace"] and not options["write"]:
            raise CommandError("--replace requires --write.")
        if not 1 <= options["quality"] <= 100:
            raise CommandError("--quality must be between 1 and 100.")
        if options["max_width"] <= 0 or options["max_height"] <= 0:
            raise CommandError("--max-width and --max-height must be positive.")

        roots = self.resolve_roots(options["paths"])
        images = []
        for root in roots:
            images.extend(self.collect_images(root))
        images = sorted(set(images))

        if not images:
            self.stdout.write("No supported images found.")
            return

        responsive_widths = self.parse_responsive_widths(options["responsive_widths"])
        total_before = 0
        total_after = 0
        optimized_count = 0
        sidecar_count = 0

        for image_path in images:
            try:
                result = self.process_image(image_path, options, responsive_widths)
            except Exception as error:
                self.stderr.write(f"ERROR  {image_path}: {error}")
                continue

            total_before += result["source_size"]
            total_after += result["target_size"]
            optimized_count += int(result["optimized"])
            sidecar_count += result["sidecars"]
            marker = "WRITE" if result["optimized"] else ("RESIZE" if result["needs_resize"] else "OK")
            if not options["write"]:
                self.stdout.write(
                    f"{marker:<6} {result['width']}x{result['height']} "
                    f"{self.format_bytes(result['source_size']):>9}  {image_path}"
                )
            elif result["optimized"]:
                self.stdout.write(
                    f"WRITE  {self.format_bytes(result['source_size'])} -> "
                    f"{self.format_bytes(result['target_size'])}  {result['target_path']}"
                )

        if options["write"]:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Optimized {optimized_count}/{len(images)} images. "
                    f"Responsive sidecars: {sidecar_count}. "
                    f"Total: {self.format_bytes(total_before)} -> {self.format_bytes(total_after)}."
                )
            )
        else:
            self.stdout.write(f"\nAudit: {len(images)} images, {self.format_bytes(total_before)} total.")
            self.stdout.write("No files changed. Add --write to optimize.")

    def resolve_roots(self, paths):
        if paths:
            return [Path(path).resolve() for path in paths]
        return [
            Path(settings.MEDIA_ROOT).resolve(),
            Path(settings.BASE_DIR, "main", "static").resolve(),
        ]

    def collect_images(self, root):
        if not root.exists():
            return []
        if root.is_file():
            return [root] if root.suffix.lower() in SUPPORTED_EXTENSIONS else []

        output = []
        for child in root.iterdir():
            if child.is_dir():
                if child.name in SKIPPED_DIRECTORIES:
                    continue
                output.extend(self.collect_images(child))
            elif child.suffix.lower() in SUPPORTED_EXTENSIONS:
                output.append(child)
        return output

    def process_image(self, image_path, options, responsive_widths):
        source_size = image_path.stat().st_size
        output_extension = ".webp" if options["format"] == "webp" else image_path.suffix.lower()
        target_path = image_path.with_suffix(output_extension)

        with Image.open(image_path) as image:
            image = ImageOps.exif_transpose(image)
            width, height = image.size
            needs_resize = width > options["max_width"] or height > options["max_height"]
            output_image = self.resize_inside(image, options["max_width"], options["max_height"])

            if options["write"]:
                self.save_image(output_image, target_path, output_extension, options["quality"])
                if options["replace"] and target_path != image_path:
                    image_path.unlink(missing_ok=True)
                sidecars = self.write_responsive_sidecars(output_image, target_path, responsive_widths, options)
            else:
                sidecars = 0

        target_size = target_path.stat().st_size if options["write"] and target_path.exists() else source_size
        return {
            "width": width,
            "height": height,
            "source_size": source_size,
            "target_size": target_size,
            "target_path": target_path,
            "needs_resize": needs_resize,
            "optimized": options["write"] and (target_path != image_path or needs_resize or target_size < source_size),
            "sidecars": sidecars,
        }

    def resize_inside(self, image, max_width, max_height):
        output = image.copy()
        output.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
        return output

    def save_image(self, image, path, extension, quality):
        path.parent.mkdir(parents=True, exist_ok=True)
        if extension in {".jpg", ".jpeg"}:
            image = image.convert("RGB")
            image.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
            return
        if extension == ".png":
            image.save(path, "PNG", optimize=True)
            return
        if extension == ".webp":
            image.save(path, "WEBP", quality=quality, method=6)
            return
        raise CommandError(f"Unsupported output extension: {extension}")

    def write_responsive_sidecars(self, image, target_path, widths, options):
        if not options["responsive"]:
            return 0

        created = 0
        source_width, _source_height = image.size
        for width in widths:
            if width >= source_width:
                continue
            sidecar = target_path.with_name(f"{target_path.stem}-{width}w.webp")
            output = image.copy()
            ratio = width / source_width
            height = max(1, round(image.size[1] * ratio))
            output = output.resize((width, height), Image.Resampling.LANCZOS)
            self.save_image(output, sidecar, ".webp", options["quality"])
            created += 1
        return created

    def parse_responsive_widths(self, value):
        widths = []
        for item in str(value or "").split(","):
            item = item.strip()
            if not item:
                continue
            try:
                width = int(item)
            except ValueError as error:
                raise CommandError("--responsive-widths must contain only integers.") from error
            if width <= 0:
                raise CommandError("--responsive-widths values must be positive.")
            widths.append(width)
        return tuple(sorted(set(widths)))

    def format_bytes(self, value):
        if value < 1024:
            return f"{value} B"
        if value < 1024 ** 2:
            return f"{value / 1024:.1f} KB"
        return f"{value / (1024 ** 2):.2f} MB"
