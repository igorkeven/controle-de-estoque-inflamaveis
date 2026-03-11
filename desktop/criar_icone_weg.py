from pathlib import Path
import struct

W = 32
H = 32

# BGRA pixels (bottom-up for BMP data in ICO)
pixels = []
for y in range(H):
    row = []
    for x in range(W):
        # fundo transparente
        b = g = r = 0
        a = 0

        # bloco azul arredondado simplificado
        if 2 <= x <= 29 and 2 <= y <= 29:
            r, g, b, a = 157, 76, 0, 255

        # "W" branco estilizado
        on_w = (
            (4 <= x <= 6 and 8 <= y <= 24)
            or (12 <= x <= 14 and 8 <= y <= 24)
            or (20 <= x <= 22 and 8 <= y <= 24)
            or (26 <= x <= 28 and 8 <= y <= 24)
            or (6 <= x <= 10 and 20 <= y <= 24)
            or (14 <= x <= 18 and 20 <= y <= 24)
            or (22 <= x <= 26 and 20 <= y <= 24)
        )
        if on_w:
            r, g, b, a = 255, 255, 255, 255

        row.append((b, g, r, a))
    pixels.append(row)

# BMP in ICO: rows bottom-up
pixel_data = bytearray()
for row in reversed(pixels):
    for b, g, r, a in row:
        pixel_data += bytes([b, g, r, a])

# AND mask: 1bpp, padded to 32-bit boundaries per row
mask_row_bytes = ((W + 31) // 32) * 4
and_mask = bytes(mask_row_bytes * H)

# BITMAPINFOHEADER (40 bytes)
biSize = 40
biWidth = W
biHeight = H * 2  # inclui XOR + AND
biPlanes = 1
biBitCount = 32
biCompression = 0
biSizeImage = len(pixel_data)
biXPelsPerMeter = 0
biYPelsPerMeter = 0
biClrUsed = 0
biClrImportant = 0

bmp_header = struct.pack(
    "<IIIHHIIIIII",
    biSize,
    biWidth,
    biHeight,
    biPlanes,
    biBitCount,
    biCompression,
    biSizeImage,
    biXPelsPerMeter,
    biYPelsPerMeter,
    biClrUsed,
    biClrImportant,
)

image_data = bmp_header + pixel_data + and_mask

# ICO header + directory entry
ico_header = struct.pack("<HHH", 0, 1, 1)
entry = struct.pack(
    "<BBBBHHII",
    W if W < 256 else 0,
    H if H < 256 else 0,
    0,
    0,
    1,
    32,
    len(image_data),
    6 + 16,
)

ico = ico_header + entry + image_data
out = Path("desktop/assets/weg.ico")
out.write_bytes(ico)
print(f"icone gerado: {out}")
