"""
core/logger.py

Structured Logging Configuration for Redirector.
Outputs formatted logs to console and rotating log file at data/app.log.
"""

import os
import logging
from logging.handlers import RotatingFileHandler

LOG_DIR = "data"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "app.log")

logger = logging.getLogger("redirector")
logger.setLevel(logging.INFO)

if not logger.handlers:
    # Console Handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s", datefmt="%H:%M:%S")
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # File Handler (5 MB max size, 3 backups)
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
    file_handler.setLevel(logging.INFO)
    file_formatter = logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)
