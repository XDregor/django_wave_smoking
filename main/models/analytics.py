from django.db import models


class SiteVisit(models.Model):
    visited_on = models.DateField(db_index=True)
    visitor_key = models.CharField(max_length=64)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-visited_on", "-created")
        constraints = (
            models.UniqueConstraint(
                fields=("visited_on", "visitor_key"),
                name="main_sitevisit_unique_visitor_per_day",
            ),
        )
        verbose_name = "Site visit"
        verbose_name_plural = "Site visits"

    def __str__(self):
        return f"{self.visited_on}: {self.visitor_key[:8]}"
