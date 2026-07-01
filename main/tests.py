from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from .models import Product, ProductReview, sanitize_product_description


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
