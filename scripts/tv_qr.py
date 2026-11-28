"""The QR code on the lobby screen (#/tv), written as a small SVG to web/public/tv-qr.svg. It opens WPR's
Letters to Santa page at the form (#write, which embed.js opens), tagged ref=tv so WPR's own analytics can
tell a scan from a screen apart from other visits. The code is drawn and read back before it's kept.
Needs Python with segno, zxing-cpp and Pillow. If the page's address ever changes, change it here and run

    python scripts/tv_qr.py
"""
import os
import sys
import tempfile

import segno
import zxingcpp
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "web", "public", "tv-qr.svg")
URL = "https://wausaupilotandreview.com/letters-to-santa/?ref=tv#write"

qr = segno.make(URL, error="m")
qr.save(OUT, kind="svg", dark="#1e2622", light="#ffffff", border=4, omitsize=True, xmldecl=False)
png = os.path.join(tempfile.gettempdir(), "santa-tv-qr.png")
qr.save(png, kind="png", scale=8, border=4)
found = [b.text for b in zxingcpp.read_barcodes(Image.open(png))]
print(f"{'ok  ' if found == [URL] else 'FAIL'} v{qr.version}, {os.path.getsize(OUT)} bytes, reads {found}")
sys.exit(0 if found == [URL] else 1)
