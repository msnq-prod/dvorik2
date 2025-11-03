"""Date and time utilities."""
from datetime import datetime, date, timedelta
from typing import Optional
import pytz
import re
from dateutil import parser

from core.config import settings


def get_vladivostok_tz() -> pytz.timezone:
    """
    Get Vladivostok timezone.
    
    Returns:
        Vladivostok timezone
    """
    return pytz.timezone(settings.TZ)


def utc_now() -> datetime:
    """
    Get current UTC datetime.
    
    Returns:
        Current datetime in UTC
    """
    return datetime.utcnow()


def vvo_now() -> datetime:
    """
    Get current datetime in Vladivostok timezone.
    
    Returns:
        Current datetime in Vladivostok timezone
    """
    utc_dt = datetime.now(pytz.UTC)
    vvo_tz = get_vladivostok_tz()
    return utc_dt.astimezone(vvo_tz)


def utc_to_vvo(dt: datetime) -> datetime:
    """
    Convert UTC datetime to Vladivostok timezone.
    
    Args:
        dt: UTC datetime
    
    Returns:
        Datetime in Vladivostok timezone
    """
    if dt.tzinfo is None:
        dt = pytz.UTC.localize(dt)
    
    vvo_tz = get_vladivostok_tz()
    return dt.astimezone(vvo_tz)


def vvo_to_utc(dt: datetime) -> datetime:
    """
    Convert Vladivostok datetime to UTC.
    
    Args:
        dt: Vladivostok datetime
    
    Returns:
        Datetime in UTC
    """
    vvo_tz = get_vladivostok_tz()
    
    if dt.tzinfo is None:
        dt = vvo_tz.localize(dt)
    
    return dt.astimezone(pytz.UTC)


def normalize_birthday(birthday_str: str) -> Optional[date]:
    """
    Normalize birthday string to date.
    
    Supports various Russian formats:
    - "3 2 2002" (DD MM YYYY)
    - "3-2-02" (DD-MM-YY)
    - "03.02.2002" (DD.MM.YYYY)
    - "03/02/2002" (DD/MM/YYYY)
    - "2002-02-03" (YYYY-MM-DD)
    
    Args:
        birthday_str: Birthday string in various formats
    
    Returns:
        Normalized date or None if parsing fails
    """
    if not birthday_str:
        return None
    
    # Remove extra whitespace
    birthday_str = birthday_str.strip()
    
    # Pattern 1: "3 2 2002" (spaces)
    match = re.match(r'^(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})$', birthday_str)
    if match:
        day, month, year = match.groups()
        day = int(day)
        month = int(month)
        year = int(year)
        
        # Handle 2-digit year
        if year < 100:
            year += 2000 if year <= 30 else 1900
        
        try:
            return date(year, month, day)
        except ValueError:
            return None
    
    # Pattern 2: "3-2-02" or "03.02.2002" (separators)
    match = re.match(r'^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$', birthday_str)
    if match:
        day, month, year = match.groups()
        day = int(day)
        month = int(month)
        year = int(year)
        
        # Handle 2-digit year
        if year < 100:
            year += 2000 if year <= 30 else 1900
        
        try:
            return date(year, month, day)
        except ValueError:
            return None
    
    # Pattern 3: ISO format "2002-02-03"
    match = re.match(r'^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$', birthday_str)
    if match:
        year, month, day = match.groups()
        try:
            return date(int(year), int(month), int(day))
        except ValueError:
            return None
    
    # Fallback: try dateutil parser
    try:
        parsed_date = parser.parse(birthday_str, dayfirst=True)
        return parsed_date.date()
    except (ValueError, parser.ParserError):
        return None


def format_datetime_for_user(dt: datetime, include_time: bool = True) -> str:
    """
    Format datetime for display to user (in Vladivostok timezone).
    
    Args:
        dt: Datetime to format (assumed UTC if no timezone)
        include_time: Include time in output
    
    Returns:
        Formatted string
    """
    vvo_dt = utc_to_vvo(dt)
    
    if include_time:
        return vvo_dt.strftime("%d.%m.%Y %H:%M")
    else:
        return vvo_dt.strftime("%d.%m.%Y")


def is_today_birthday(birthday: date) -> bool:
    """
    Check if today is the birthday (in Vladivostok timezone).
    
    Args:
        birthday: Birthday date
    
    Returns:
        True if today is the birthday
    """
    today_vvo = vvo_now().date()
    return (birthday.month == today_vvo.month and 
            birthday.day == today_vvo.day)


def add_days(dt: datetime, days: int) -> datetime:
    """
    Add days to datetime.
    
    Args:
        dt: Datetime
        days: Number of days to add
    
    Returns:
        New datetime
    """
    return dt + timedelta(days=days)


def calculate_expiry_date(validity_days: int) -> datetime:
    """
    Calculate expiry date from current time + validity days.
    
    Args:
        validity_days: Number of days until expiry
    
    Returns:
        Expiry datetime (UTC)
    """
    return utc_now() + timedelta(days=validity_days)

