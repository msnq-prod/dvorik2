"""Core utilities package."""
from core.utils.datetime import (
    get_vladivostok_tz,
    utc_now,
    vvo_now,
    utc_to_vvo,
    vvo_to_utc,
    normalize_birthday,
    format_datetime_for_user,
    is_today_birthday,
    add_days,
    calculate_expiry_date
)
from core.utils.code_generator import (
    generate_discount_code,
    normalize_code,
    try_find_code_variants,
    validate_code_format
)
from core.utils.validators import (
    validate_tags,
    validate_phone_number,
    validate_telegram_id,
    validate_segment_definition,
    validate_json_buttons,
    normalize_source
)

__all__ = [
    # Datetime utils
    "get_vladivostok_tz",
    "utc_now",
    "vvo_now",
    "utc_to_vvo",
    "vvo_to_utc",
    "normalize_birthday",
    "format_datetime_for_user",
    "is_today_birthday",
    "add_days",
    "calculate_expiry_date",
    
    # Code generation
    "generate_discount_code",
    "normalize_code",
    "try_find_code_variants",
    "validate_code_format",
    
    # Validators
    "validate_tags",
    "validate_phone_number",
    "validate_telegram_id",
    "validate_segment_definition",
    "validate_json_buttons",
    "normalize_source",
]

