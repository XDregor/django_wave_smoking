from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.db.models.deletion import ProtectedError
from django.db.models.signals import pre_delete
from django.dispatch import receiver
from django.utils.text import slugify

from . import brand_image_upload_to, make_unique_slug

class Category(models.Model):
    name = models.CharField(max_length=100, db_index=True)
    slug = models.SlugField(max_length=100, unique=True)

    class Meta:
        ordering = ("name",)
        verbose_name = "Category"
        verbose_name_plural = "Categories"

    def save(self, *args, **kwargs):
        self.slug = make_unique_slug(Category, self.name, self.pk)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    image = models.ImageField(upload_to=brand_image_upload_to, blank=True, verbose_name="Image")
    show_in_carousel = models.BooleanField(default=False, verbose_name="Show in carousel")

    class Meta:
        ordering = ("name",)
        verbose_name = "Brand"
        verbose_name_plural = "Brands"

    def save(self, *args, **kwargs):
        self.slug = make_unique_slug(Brand, self.name, self.pk)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class VariantGroup(models.Model):
    KIND_DEFAULT = ""
    KIND_COLOR = "color"
    KIND_CHOICES = (
        (KIND_DEFAULT, "Обычная"),
        (KIND_COLOR, "Цвет"),
    )

    name = models.CharField(max_length=80, unique=True, verbose_name="Group name")
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    order = models.PositiveIntegerField(default=0, verbose_name="Order")
    kind = models.CharField(
        max_length=16,
        choices=KIND_CHOICES,
        blank=True,
        default=KIND_DEFAULT,
        editable=False,
        verbose_name="System group type",
    )

    class Meta:
        ordering = ("order", "name")
        verbose_name = "Variant group"
        verbose_name_plural = "Variant groups"
        constraints = (
            models.UniqueConstraint(
                fields=("kind",),
                condition=models.Q(kind="color"),
                name="main_variantgroup_single_color_kind",
            ),
        )

    @property
    def is_color_group(self):
        return self.kind == self.KIND_COLOR

    @property
    def is_system_group(self):
        return bool(self.kind)

    def save(self, *args, **kwargs):
        if self.is_color_group:
            self.name = "Цвет"
            self.order = 0
        self.slug = make_unique_slug(VariantGroup, self.name, self.pk)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class VariantOption(models.Model):
    group = models.ForeignKey(
        VariantGroup,
        related_name="options",
        on_delete=models.CASCADE,
        verbose_name="Group",
    )
    name = models.CharField(max_length=100, verbose_name="Name")
    filter_name = models.CharField(max_length=100, blank=True, default="", verbose_name="Filter name")
    color_hex = models.CharField(
        max_length=7,
        blank=True,
        default="",
        validators=(
            RegexValidator(
                regex=r"^#[0-9A-Fa-f]{6}$",
                message="Color must use the #RRGGBB format.",
            ),
        ),
        verbose_name="Physical color",
    )
    slug = models.SlugField(max_length=120, blank=True, verbose_name="Slug")
    order = models.PositiveIntegerField(default=0, verbose_name="Order")

    class Meta:
        ordering = ("group__order", "group__name", "order", "name")
        verbose_name = "Variant option"
        verbose_name_plural = "Variant options"
        constraints = (
            models.UniqueConstraint(
                fields=("group", "name"),
                name="main_variantoption_unique_group_name",
            ),
        )

    def save(self, *args, **kwargs):
        self.filter_name = (self.filter_name or "").strip() or self.name
        self.color_hex = (self.color_hex or "").strip().upper()
        if self.group_id and not self.group.is_color_group:
            self.color_hex = ""
        if self.color_hex and not self.color_hex.startswith("#"):
            self.color_hex = f"#{self.color_hex}"
        if self.color_hex:
            try:
                self._meta.get_field("color_hex").run_validators(self.color_hex)
            except ValidationError as exc:
                raise ValidationError({"color_hex": exc.messages}) from exc
        base = f"{self.group.slug}-{self.name}" if self.group_id else self.name
        self.slug = make_unique_slug(VariantOption, base, self.pk)
        super().save(*args, **kwargs)

    @property
    def filter_slug(self):
        return slugify(self.filter_name or self.name, allow_unicode=True) or self.slug

    def __str__(self):
        prefix = f"{self.group.name}: " if self.group_id else ""
        return f"{prefix}{self.name}"


@receiver(pre_delete, sender=VariantGroup)
def protect_system_variant_group(sender, instance, **kwargs):
    if instance.is_system_group:
        raise ProtectedError(
            "System variant groups cannot be deleted.",
            [instance],
        )
