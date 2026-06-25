from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from .models import Product, sanitize_product_description


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
