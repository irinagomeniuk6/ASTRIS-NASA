#!/usr/bin/env python3
"""Create a QR code for the *actual* HTTPS deployment URL. pip install qrcode[pil]"""
import sys
from urllib.parse import urlparse
try:
    import qrcode
except ImportError:
    raise SystemExit('Install dependency: python -m pip install "qrcode[pil]"')
if len(sys.argv) < 2 or urlparse(sys.argv[1]).scheme != 'https' or not urlparse(sys.argv[1]).hostname:
    raise SystemExit('Usage: python scripts/qr-for-url.py https://YOUR-PUBLIC-SITE.onrender.com')
url=sys.argv[1].rstrip('/') + '/'
qrcode.make(url).save('ASTRIS-QR.png')
print('Created ASTRIS-QR.png for',url)
