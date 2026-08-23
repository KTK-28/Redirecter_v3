"""
wsgi.py

Production WSGI Entrypoint for Gunicorn / Waitress Servers.
"""

from app import app

if __name__ == "__main__":
    app.run()
