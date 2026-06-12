from django.core.management.base import BaseCommand

from main.models import Product, ProductReview


class Command(BaseCommand):
    help = "Seed product reviews for existing products."

    def handle(self, *args, **options):
        products = list(Product.objects.filter(available=True).order_by("name"))
        if not products:
            self.stdout.write(self.style.WARNING("No products found. Reviews were not created."))
            return

        samples = [
            ("Александр М.", 5, "Отличный товар, приехал быстро и был хорошо упакован."),
            ("Катерина В.", 5, "Понравился вкус и стабильная работа. Закажу ещё."),
            ("Дмитрий Г.", 4, "В целом доволен покупкой, цена и качество нормальные."),
            ("Олег П.", 5, "Товар полностью соответствует описанию, магазин сработал быстро."),
            ("Анна С.", 3, "Доставка быстрая, но вкус оказался не совсем моим."),
            ("Виталий К.", 5, "Удобный товар на каждый день, всё работает без проблем."),
            ("Иван М.", 4, "Хороший вариант за свои деньги. Упаковка аккуратная."),
            ("Настя Б.", 5, "Покупаю не первый раз, качество стабильное."),
            ("Марина Л.", 5, "Очень приятный вкус и быстрая отправка."),
            ("Сергей Р.", 4, "Нормальный товар, замечаний почти нет."),
            ("Юлия Н.", 5, "Спасибо, всё пришло целое и рабочее."),
            ("Максим Т.", 3, "Можно брать, но ожидал чуть более насыщенный вкус."),
        ]

        created = 0
        for index, sample in enumerate(samples):
            product = products[index % len(products)]
            author, rating, text = sample
            _, was_created = ProductReview.objects.get_or_create(
                product=product,
                author_name=author,
                text=text,
                defaults={
                    "rating": rating,
                    "is_verified": index % 4 != 0,
                    "is_approved": True,
                    "helpful_count": max(0, 28 - index * 2),
                },
            )
            created += int(was_created)

        self.stdout.write(self.style.SUCCESS(f"Created {created} review(s)."))
