"""Discount code generation utilities."""
import random
import string

from core.config import settings


# Cyrillic letters for code generation (easy to read, no confusing characters)
CYRILLIC_LETTERS = "АБВГДЕЖЗКЛМНПРСТУФХЦЧШЩЭЮЯ"

# Digits for code generation (excluding 0 and O for clarity)
DIGITS = "123456789"


def generate_discount_code(length: int = 7) -> str:
    """
    Generate unique discount code.
    
    Format: 3 cyrillic letters + 4 digits (e.g., "АБВ1234")
    
    Args:
        length: Code length (default 7: 3 letters + 4 digits)
    
    Returns:
        Generated code
    """
    # Calculate letters and digits count
    letters_count = 3
    digits_count = length - letters_count
    
    # Generate letters part
    letters = ''.join(random.choices(CYRILLIC_LETTERS, k=letters_count))
    
    # Generate digits part
    digits = ''.join(random.choices(DIGITS, k=digits_count))
    
    # Combine
    code = letters + digits
    
    # Add prefix if configured
    if settings.CODE_PREFIX:
        code = settings.CODE_PREFIX + code
    
    return code


def normalize_code(code: str, remove_prefix: bool = True) -> str:
    """
    Normalize discount code for search.
    
    Normalization rules:
    1. Convert to UPPERCASE
    2. Remove prefix if configured
    3. Strip whitespace
    
    Args:
        code: Code to normalize
        remove_prefix: Remove prefix if True
    
    Returns:
        Normalized code
    """
    # Strip and uppercase
    normalized = code.strip().upper()
    
    # Remove prefix if configured and requested
    if remove_prefix and settings.CODE_PREFIX:
        prefix = settings.CODE_PREFIX.upper()
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):]
    
    return normalized


def try_find_code_variants(code: str) -> list[str]:
    """
    Generate code variants for flexible search.
    
    Returns list of variants to try:
    1. As-is
    2. Uppercase
    3. Without prefix
    4. Without prefix + uppercase
    
    Args:
        code: Original code
    
    Returns:
        List of code variants to search
    """
    variants = []
    
    # Variant 1: as-is
    variants.append(code.strip())
    
    # Variant 2: uppercase
    uppercase = code.strip().upper()
    if uppercase not in variants:
        variants.append(uppercase)
    
    # Variant 3: without prefix
    if settings.CODE_PREFIX:
        prefix = settings.CODE_PREFIX.upper()
        for variant in list(variants):
            if variant.upper().startswith(prefix):
                no_prefix = variant[len(prefix):]
                if no_prefix not in variants:
                    variants.append(no_prefix)
    
    return variants


def validate_code_format(code: str) -> bool:
    """
    Validate discount code format.
    
    Expected format: 3 cyrillic letters + 4 digits (with optional prefix)
    
    Args:
        code: Code to validate
    
    Returns:
        True if format is valid, False otherwise
    """
    # Normalize code
    normalized = normalize_code(code, remove_prefix=True)
    
    # Check length
    if len(normalized) != settings.CODE_LENGTH:
        return False
    
    # Check format: 3 letters + 4 digits
    letters_part = normalized[:3]
    digits_part = normalized[3:]
    
    # Validate letters (should be cyrillic)
    if not all(c in CYRILLIC_LETTERS for c in letters_part):
        return False
    
    # Validate digits
    if not digits_part.isdigit():
        return False
    
    return True

