from django.conf import settings
from django.db import models


class ClientProfile(models.Model):
    PROVIDER_GOOGLE = "google.com"
    PROVIDER_APPLE = "apple.com"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        related_name="client_profile",
        on_delete=models.CASCADE,
        verbose_name="User",
    )
    firebase_uid = models.CharField(max_length=128, unique=True, verbose_name="Firebase UID")
    provider = models.CharField(max_length=40, blank=True, verbose_name="Auth provider")
    nickname = models.CharField(max_length=32, unique=True, verbose_name="Nickname")
    birth_date = models.DateField(verbose_name="Birth date")
    display_name = models.CharField(max_length=120, blank=True, verbose_name="Display name")
    avatar_url = models.URLField(blank=True, verbose_name="Avatar URL")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated",)
        verbose_name = "Client profile"
        verbose_name_plural = "Client profiles"

    def __str__(self):
        return f"@{self.nickname}"
