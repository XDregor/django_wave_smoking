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
    Brand,
    Cart,
    CartItem,
    Category,
    Product,
    ProductReview,
    ProductSpecification,
    ProductVariant,
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


class FlavorVariantGroupTests(TestCase):
    def setUp(self):
        self.flavor_group = VariantGroup.objects.get(kind=VariantGroup.KIND_FLAVOR)

    def test_flavor_group_name_and_order_are_fixed(self):
        self.flavor_group.name = "Designer flavor"
        self.flavor_group.order = 99
        self.flavor_group.save()

        self.assertEqual(self.flavor_group.name, "Вкус")
        self.assertEqual(self.flavor_group.order, 1)

    def test_flavor_group_cannot_be_deleted(self):
        with self.assertRaises(ProtectedError):
            self.flavor_group.delete()

    def test_flavor_option_keeps_display_and_filter_names_separate(self):
        option = VariantOption.objects.create(
            group=self.flavor_group,
            name="Mystic Raspberry",
            filter_name="Малина",
        )

        self.assertEqual(option.name, "Mystic Raspberry")
        self.assertEqual(option.filter_name, "Малина")

    def test_empty_flavor_filter_name_falls_back_to_display_name(self):
        option = VariantOption.objects.create(
            group=self.flavor_group,
            name="Dark Forest",
            filter_name="",
        )

        self.assertEqual(option.filter_name, "Dark Forest")


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


class ProductEditorInitialStepTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username="product-editor-admin",
            password="test-password",
        )
        category = Category.objects.create(name="Editor test category")
        brand = Brand.objects.create(name="Editor test brand")
        self.product = Product.objects.create(
            name="Editor test product",
            category=category,
            brand=brand,
            old_price=Decimal("100"),
            price=Decimal("100"),
        )
        self.client.force_login(self.user)

    def test_management_page_edit_link_targets_publication_step(self):
        response = self.client.get(reverse("admin:main_product_products_list"))
        edit_url = reverse("admin:main_product_edit_sku", args=(self.product.pk,))

        self.assertContains(response, f"{edit_url}?step=6")

    def test_editor_exposes_requested_initial_step(self):
        edit_url = reverse("admin:main_product_edit_sku", args=(self.product.pk,))
        response = self.client.get(f"{edit_url}?step=6")

        self.assertContains(response, 'data-initial-step="6"')


    def test_editor_serializes_characteristic_order_and_key_state(self):
        ProductSpecification.objects.create(
            product=self.product,
            name="Мощность",
            value="30 Вт",
            order=1,
            is_key=True,
            icon=ProductSpecification.ICON_BOLT,
        )
        ProductSpecification.objects.create(
            product=self.product,
            name="Объём",
            value="2 мл",
            order=0,
        )

        response = self.client.get(reverse("admin:main_product_edit_sku", args=(self.product.pk,)))

        self.assertEqual(
            response.context["edit_product_payload"]["chars"],
            [
                {"key": "Объём", "value": "2 мл", "isKey": False, "icon": "info"},
                {"key": "Мощность", "value": "30 Вт", "isKey": True, "icon": "bolt"},
            ],
        )

    def test_product_card_renders_key_characteristic_control_and_icon(self):
        ProductSpecification.objects.create(
            product=self.product,
            name="Мощность",
            value="30 Вт",
            is_key=True,
            icon=ProductSpecification.ICON_BOLT,
        )

        response = self.client.get(reverse("main:home"))

        self.assertContains(response, "product_card_specs_toggle_button")
        self.assertContains(response, "product_card_specs_panel")
        self.assertContains(response, "Мощность")
        self.assertContains(response, "30 Вт")

    def test_editor_exposes_existing_characteristic_names_as_suggestions(self):
        ProductSpecification.objects.create(
            product=self.product,
            name="Мощность",
            value="30 Вт",
        )

        response = self.client.get(reverse("admin:main_product_add_sku"))

        self.assertIn("Мощность", response.context["specification_name_catalog"])
        self.assertContains(response, '<option value="Мощность"></option>', html=True)


class CartApiMergeTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Cart test category")
        self.brand = Brand.objects.create(name="Cart test brand")
        self.product = Product.objects.create(
            name="Cart merge product",
            category=self.category,
            brand=self.brand,
            old_price=Decimal("120"),
            price=Decimal("100"),
            stock=10,
            available=True,
        )

    def test_repeated_product_add_increases_existing_cart_item_quantity(self):
        payload = {"product_id": self.product.pk, "quantity": 1}

        first_response = self.client.post(
            reverse("main:api_cart_add"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        second_response = self.client.post(
            reverse("main:api_cart_add"),
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(CartItem.objects.filter(product=self.product).count(), 1)
        self.assertEqual(second_response.json()["cart"]["items"][0]["quantity"], 2)
        self.assertEqual(second_response.json()["cart"]["total_quantity"], 2)

    def test_cart_get_merges_existing_duplicate_variant_items(self):
        group = VariantGroup.objects.create(name="Cart color", order=10)
        option = VariantOption.objects.create(group=group, name="Black")
        variant = ProductVariant.objects.create(
            product=self.product,
            variant=option,
            stock=10,
            available=True,
        )

        cart_response = self.client.get(reverse("main:api_cart"))
        session_key = self.client.session.session_key
        cart = Cart.objects.get(session_key=session_key)
        CartItem.objects.create(
            cart=cart,
            product=self.product,
            product_variant=variant,
            selected_variant_ids=[],
            quantity=1,
            price=self.product.price,
        )
        CartItem.objects.create(
            cart=cart,
            product=self.product,
            product_variant=None,
            selected_variant_ids=[variant.id],
            quantity=2,
            price=self.product.price,
        )

        response = self.client.get(reverse("main:api_cart"))

        self.assertEqual(cart_response.status_code, 200)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(CartItem.objects.filter(cart=cart, product=self.product).count(), 1)
        self.assertEqual(response.json()["items"][0]["quantity"], 3)
        self.assertEqual(response.json()["total_quantity"], 3)


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
