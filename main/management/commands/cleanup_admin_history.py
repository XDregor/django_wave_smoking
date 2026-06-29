from datetime import timedelta

from django.contrib.admin.models import LogEntry
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Delete Django admin action history entries older than the retention window."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=30,
            help="Keep entries for this many days. Defaults to 30.",
        )

    def handle(self, *args, **options):
        days = max(1, int(options["days"]))
        cutoff = timezone.now() - timedelta(days=days)
        deleted, _ = LogEntry.objects.filter(action_time__lt=cutoff).delete()
        self.stdout.write(
            self.style.SUCCESS(f"Deleted {deleted} admin history entries older than {days} days.")
        )
