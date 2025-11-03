"""Validation utilities."""
import re
from typing import Optional


def validate_tags(tags: list[str]) -> tuple[bool, Optional[str]]:
    """
    Validate tags list.
    
    Rules:
    - Maximum 20 tags
    - Maximum 32 characters per tag
    - No empty tags
    
    Args:
        tags: List of tags to validate
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not tags:
        return True, None
    
    if len(tags) > 20:
        return False, "Maximum 20 tags allowed"
    
    for tag in tags:
        if not tag or not tag.strip():
            return False, "Empty tags are not allowed"
        
        if len(tag) > 32:
            return False, f"Tag '{tag}' exceeds 32 characters"
    
    return True, None


def validate_phone_number(phone: str) -> tuple[bool, Optional[str]]:
    """
    Validate phone number format.
    
    Accepts:
    - Russian format: +7XXXXXXXXXX
    - International format: +XXXXXXXXXXX
    
    Args:
        phone: Phone number to validate
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not phone:
        return True, None
    
    # Remove spaces and dashes
    cleaned = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    
    # Check format: starts with + and has 10-15 digits
    pattern = r'^\+\d{10,15}$'
    
    if not re.match(pattern, cleaned):
        return False, "Invalid phone number format. Use international format: +7XXXXXXXXXX"
    
    return True, None


def validate_telegram_id(telegram_id: int) -> tuple[bool, Optional[str]]:
    """
    Validate Telegram ID.
    
    Args:
        telegram_id: Telegram ID to validate
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if telegram_id <= 0:
        return False, "Telegram ID must be positive"
    
    if telegram_id > 9999999999:  # Reasonable upper limit
        return False, "Invalid Telegram ID"
    
    return True, None


def validate_segment_definition(definition: dict) -> tuple[bool, Optional[str]]:
    """
    Validate segment definition structure.
    
    Args:
        definition: Segment definition dict
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(definition, dict):
        return False, "Definition must be a dictionary"
    
    # Define allowed keys
    allowed_keys = {
        'status', 'is_subscribed', 'tags', 'source', 'source_normalized',
        'gender', 'birthday_month', 'created_after', 'created_before',
        'has_discount', 'discount_used'
    }
    
    # Check for unknown keys
    unknown_keys = set(definition.keys()) - allowed_keys
    if unknown_keys:
        return False, f"Unknown keys in definition: {', '.join(unknown_keys)}"
    
    # Validate value types
    if 'status' in definition and definition['status'] not in ['active', 'blocked']:
        return False, "status must be 'active' or 'blocked'"
    
    if 'is_subscribed' in definition and not isinstance(definition['is_subscribed'], bool):
        return False, "is_subscribed must be a boolean"
    
    if 'tags' in definition and not isinstance(definition['tags'], list):
        return False, "tags must be a list"
    
    if 'gender' in definition and definition['gender'] not in ['male', 'female', 'unknown']:
        return False, "gender must be 'male', 'female', or 'unknown'"
    
    if 'birthday_month' in definition:
        month = definition['birthday_month']
        if not isinstance(month, int) or month < 1 or month > 12:
            return False, "birthday_month must be an integer between 1 and 12"
    
    return True, None


def validate_json_buttons(buttons: dict) -> tuple[bool, Optional[str]]:
    """
    Validate Telegram inline keyboard buttons structure.
    
    Args:
        buttons: Buttons dict
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(buttons, dict):
        return False, "Buttons must be a dictionary"
    
    # Check for required keys
    if 'inline_keyboard' not in buttons:
        return False, "Buttons must have 'inline_keyboard' key"
    
    keyboard = buttons['inline_keyboard']
    
    if not isinstance(keyboard, list):
        return False, "inline_keyboard must be a list"
    
    # Validate each row
    for row_idx, row in enumerate(keyboard):
        if not isinstance(row, list):
            return False, f"Row {row_idx} must be a list"
        
        # Validate each button in row
        for btn_idx, button in enumerate(row):
            if not isinstance(button, dict):
                return False, f"Button at row {row_idx}, position {btn_idx} must be a dict"
            
            if 'text' not in button:
                return False, f"Button at row {row_idx}, position {btn_idx} must have 'text' key"
            
            # Must have at least one action key
            action_keys = {'url', 'callback_data', 'switch_inline_query', 'switch_inline_query_current_chat'}
            if not any(key in button for key in action_keys):
                return False, f"Button at row {row_idx}, position {btn_idx} must have an action (url, callback_data, etc.)"
    
    return True, None


def normalize_source(source: str) -> str:
    """
    Normalize source string for filtering.
    
    Rules:
    - Convert to lowercase
    - Remove common prefixes (ref_, utm_, source_)
    
    Args:
        source: Source string
    
    Returns:
        Normalized source
    """
    if not source:
        return ""
    
    normalized = source.lower().strip()
    
    # Remove common prefixes
    prefixes = ['ref_', 'utm_', 'source_']
    for prefix in prefixes:
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):]
            break
    
    return normalized

