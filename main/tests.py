import json
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db.models.deletion import ProtectedError
from django.test import Client, SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone

from .models import (
    Category,
    Product,
    ProductReview,
    SiteVisit,
    VariantGroup,
    VariantOption,
    sanitize_product_description,
)


class ProductInputSafetyTests(SimpleTestCase):
    def test_description_sanitizer_keeps_formatting_and_removes_unsafe_html(self):
        value = (
            '<p onclick="bad()"><strong>Text</strong>'
            '<script>alert(1)</script>'
            '<a href="javascript:bad()">link</a></p>'
        )

        cleaned = sanitize_product_description(value)

        self.assertEqual(cleaned, "<p><strong>Text</strong><a>link</a></p>")

    def test_plain_description_keeps_line_breaks(self):
        self.assertEqual(sanitize_product_description("First\nSecond"), "<p>First<br>Second</p>")

    def test_product_name_rejects_html(self):
        product = Product(name="<b>Unsafe</b>", old_price=Decimal("10"), price=Decimal("10"))

        with self.assertRaises(ValidationError):
            product.clean()

    def test_sale_badge_overrides_manual_badge(self):
        product = Product(
            name="Product",
            old_price=Decimal("100"),
            price=Decimal("80"),
            badge_type=Product.BADGE_TOP,
        )

        self.assertEqual(product.get_badge_data(), {"type": "sale", "label": "-20%"})


class ManualLikeAdjustmentTests(SimpleTestCase):
    def test_product_display_likes_combines_real_and_admin_counts(self):
        product = Product(likes=7, likes_adjustment=4)

        self.assertEqual(product.display_likes, 11)

    def test_review_display_helpful_count_never_goes_below_zero(self):
        review = ProductReview(helpful_count=3, helpful_adjustment=-10)

        self.assertEqual(review.display_helpful_count, 0)


class ColorVariantGroupTests(TestCase):
    def setUp(self):
        self.color_group = VariantGroup.objects.get(kind=VariantGroup.KIND_COLOR)

    def test_color_group_name_is_fixed(self):
        self.color_group.name = "Another name"
        self.color_group.order = 99
        self.color_group.save()

        self.assertEqual(self.color_group.name, "Цвет")
        self.assertEqual(self.color_group.order, 0)

    def test_color_group_cannot_be_deleted(self):
        with self.assertRaises(ProtectedError):
            self.color_group.delete()

    def test_color_option_normalizes_hex(self):
        option = VariantOption.objects.create(
            group=self.color_group,
            name="Test color",
            filter_name="Test",
            color_hex="#a1b2c3",
        )

        self.assertEqual(option.color_hex, "#A1B2C3")

    def test_regular_group_does_not_store_physical_color(self):
        group = VariantGroup.objects.create(name="Size", order=10)
        option = VariantOption.objects.create(
            group=group,
            name="Large",
            color_hex="#FFFFFF",
        )

        self.assertEqual(option.color_hex, "")


class CategoryAdminDeleteTests(TestCase):
    def test_custom_admin_endpoint_deletes_empty_category(self):
        user = get_user_model().objects.create_superuser(
            username="category-admin",
            password="test-password",
        )
        category = Category.objects.create(name="Temporary category")
        client = Client()
        client.force_login(user)

        response = client.post(
            reverse("admin:main_category_delete"),
            data=json.dumps({"id": category.pk}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Category.objects.filter(pk=category.pk).exists())


class SiteVisitAnalyticsTests(TestCase):
    def test_public_html_visit_is_counted_once_per_session_and_day(self):
        client = Client()

        self.assertEqual(client.get(reverse("main:home")).status_code, 200)
        self.assertEqual(client.get(reverse("main:catalog")).status_code, 200)

        self.assertEqual(SiteVisit.objects.count(), 1)
        self.assertEqual(SiteVisit.objects.get().visited_on, timezone.localdate())

    def test_separate_sessions_are_counted_as_separate_visitors(self):
        self.assertEqual(Client().get(reverse("main:home")).status_code, 200)
        self.assertEqual(Client().get(reverse("main:home")).status_code, 200)

        self.assertEqual(SiteVisit.objects.count(), 2)

    def test_admin_requests_are_not_counted(self):
        user = get_user_model().objects.create_superuser(
            username="dashboard-admin",
            password="test-password",
        )
        client = Client()
        client.force_login(user)

        self.assertEqual(client.get(reverse("admin:index")).status_code, 200)
        self.assertEqual(SiteVisit.objects.count(), 0)

    def test_dashboard_endpoint_returns_fourteen_days_for_staff(self):
        user = get_user_model().objects.create_superuser(
            username="analytics-admin",
            password="test-password",
        )
        today = timezone.localdate()
        SiteVisit.objects.create(visited_on=today, visitor_key="today")
        SiteVisit.objects.create(
            visited_on=today - timedelta(days=7),
            visitor_key="previous-week",
        )
        client = Client()
        client.force_login(user)

        response = client.get(reverse("admin_dashboard_visits"))
        payload = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(payload["points"]), 14)
        self.assertEqual(payload["today"], 1)
        self.assertEqual(payload["week"], 1)
        self.assertEqual(payload["trend"], 0)
