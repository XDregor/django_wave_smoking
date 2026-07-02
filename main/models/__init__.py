from decimal import Decimal, ROUND_HALF_UP
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q, Sum
from django.utils.html import strip_tags
from django.utils.text import slugify


ALLOWED_PRODUCT_DESCRIPTION_TAGS = {"p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "h1", "h2"}
BLOCKED_PRODUCT_DESCRIPTION_TAGS = {"script", "style", "iframe"}
SAFE_LINK_SCHEMES = {"", "http", "https", "mailto", "tel"}


class ProductDescriptionSanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.blocked_depth = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in BLOCKED_PRODUCT_DESCRIPTION_TAGS:
            self.blocked_depth += 1
            return
        if self.blocked_depth:
            return
        if tag not in ALLOWED_PRODUCT_DESCRIPTION_TAGS:
            return
        attr_text = ""
        if tag == "a":
            href = ""
            for name, value in attrs:
                if name.lower() == "href":
                    href = (value or "").strip()
                    break
            if href and urlparse(href).scheme.lower() in SAFE_LINK_SCHEMES and not href.lower().startswith("javascript:"):
                attr_text = f' href="{escape(href, quote=True)}" rel="noopener noreferrer"'
        self.parts.append(f"<{tag}{attr_text}>")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in BLOCKED_PRODUCT_DESCRIPTION_TAGS:
            self.blocked_depth = max(0, self.blocked_depth - 1)
            return
        if self.blocked_depth:
            return
        if tag in ALLOWED_PRODUCT_DESCRIPTION_TAGS and tag != "br":
            self.parts.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.blocked_depth:
            self.parts.append(escape(data))

    def handle_entityref(self, name):
        if not self.blocked_depth:
            self.parts.append(f"&{name};")

    def handle_charref(self, name):
        if not self.blocked_depth:
            self.parts.append(f"&#{name};")

    def get_html(self):
        return "".join(self.parts).strip()


def sanitize_product_description(value):
    raw_value = str(value or "").strip()
    if raw_value and "<" not in raw_value and ">" not in raw_value:
        return f"<p>{escape(raw_value).replace(chr(10), '<br>')}</p>"
    sanitizer = ProductDescriptionSanitizer()
    sanitizer.feed(raw_value)
    sanitizer.close()
    return sanitizer.get_html()


def get_upload_extension(filename):
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return extension or "webp"


def get_product_upload_identity(product):
    product_id = product.pk or "new"
    product_slug = product.slug or slugify(product.name) or "product"
    return product_id, product_slug


def product_main_image_upload_to(instance, filename):
    product_id, product_slug = get_product_upload_identity(instance)
    extension = get_upload_extension(filename)
    return f"products/{product_id}/main/product-{product_id}-{product_slug}-main-original.{extension}"


def product_video_upload_to(instance, filename):
    product_id, product_slug = get_product_upload_identity(instance)
    extension = get_upload_extension(filename)
    return f"products/{product_id}/video/product-{product_id}-{product_slug}-promo-video.{extension}"


def product_video_poster_upload_to(instance, filename):
    product_id, product_slug = get_product_upload_identity(instance)
    extension = get_upload_extension(filename)
    return f"products/{product_id}/video/product-{product_id}-{product_slug}-video-poster-original.{extension}"


def product_variant_image_upload_to(instance, filename):
    product = instance.product
    product_id, product_slug = get_product_upload_identity(product)
    variant = getattr(instance, "variant", None)
    if variant is not None:
        variant_slug = variant.slug or slugify(variant.name) or "variant"
    else:
        variant_slug = slugify(getattr(instance, "sku_code", "") or "sku") or "sku"
    extension = get_upload_extension(filename)
    return f"products/{product_id}/variants/product-{product_id}-{product_slug}-variant-{variant_slug}-original.{extension}"


def product_gallery_image_upload_to(instance, filename):
    product = instance.product
    product_id, product_slug = get_product_upload_identity(product)
    order = (instance.order or 0) + 1
    extension = get_upload_extension(filename)
    return f"products/{product_id}/gallery/product-{product_id}-{product_slug}-gallery-{order:02d}-original.{extension}"


def brand_image_upload_to(instance, filename):
    brand_id = instance.pk or "new"
    brand_slug = instance.slug or slugify(instance.name) or "brand"
    extension = get_upload_extension(filename)
    return f"brands/{brand_id}/brand-{brand_id}-{brand_slug}-logo.{extension}"


def make_unique_slug(model_class, value, instance_pk=None):
    base_slug = slugify(value) or "item"
    slug = base_slug
    index = 2
    queryset = model_class.objects.all()
    if instance_pk:
        queryset = queryset.exclude(pk=instance_pk)
    while queryset.filter(slug=slug).exists():
        slug = f"{base_slug}-{index}"
        index += 1
    return slug

from .catalog import Brand, Category, VariantGroup, VariantOption
from .product import (
    Product,
    ProductAlsoChosen,
    ProductImage,
    ProductSKU,
    ProductSpecification,
    ProductVariant,
)
from .reviews import ProductLike, ProductReview, ProductReviewHelpful
from .cart import Cart, CartItem
from .analytics import SiteVisit

__all__ = (
    "Brand", "Cart", "CartItem", "Category", "Product", "ProductAlsoChosen",
    "ProductImage", "ProductLike", "ProductReview", "ProductReviewHelpful",
    "ProductSKU", "ProductSpecification", "ProductVariant", "VariantGroup",
    "VariantOption", "SiteVisit", "sanitize_product_description",
)
