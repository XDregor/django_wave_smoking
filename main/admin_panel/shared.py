import json
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django import forms
from django.contrib import admin
from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import transaction
from django.db.models import Avg, Count, Max, Prefetch, Sum
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html, strip_tags

try:
    from unfold.admin import ModelAdmin, TabularInline
except ImportError:  # Keeps local checks usable when django-unfold is not installed.
    from django.contrib.admin import ModelAdmin, TabularInline

from ..models import (
    Brand,
    Cart,
    CartItem,
    Category,
    Product,
    ProductAlsoChosen,
    ProductImage,
    ProductLike,
    ProductReview,
    ProductReviewHelpful,
    ProductSKU,
    ProductSpecification,
    ProductVariant,
    WarehouseBatch,
    WarehouseBatchItem,
    WarehouseCounterparty,
    WarehouseItem,
    WarehousePointsWeekClose,
    WarehouseShipmentOrder,
    WarehouseShipmentOrderItem,
    WarehouseShippingPhone,
    WarehouseWriteOff,
    WarehouseWriteOffItem,
    VariantGroup,
    VariantOption,
    sanitize_product_description,
)


User = get_user_model()


class BusinessAdminMixin:
    save_on_top = True


class HiddenFromMenuAdminMixin:
    def has_module_permission(self, request):
        return False


class SuperuserOnlyAdminMixin:
    def has_module_permission(self, request):
        return bool(request.user and request.user.is_superuser)

    def has_view_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)

    def has_change_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)

    def has_add_permission(self, request):
        return bool(request.user and request.user.is_superuser)

    def has_delete_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)
