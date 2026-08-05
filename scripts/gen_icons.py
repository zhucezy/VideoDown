# -*- coding: utf-8 -*-
"""
生成 tabBar 图标（81x81 PNG，RGBA）。
不依赖 Pillow，直接手写 PNG 编码 + 4x 超采样抗锯齿。

用法: python scripts/gen_icons.py
输出: miniprogram/assets/tabbar/*.png
"""
import os
import zlib
import struct
import math

SIZE = 81
SS = 4  # 超采样倍数

NORMAL = (0x9A, 0xA0, 0xA6)
ACTIVE = (0x2B, 0x6D, 0xF6)


# ---------- PNG 编码 ----------
def write_png(path, width, height, pixels):
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        for x in range(width):
            raw.extend(pixels[y][x])

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        c += struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')

    with open(path, 'wb') as f:
        f.write(png)


# ---------- 几何工具（坐标归一化到 0..1） ----------
def seg_dist(px, py, x1, y1, x2, y2):
    vx, vy = x2 - x1, y2 - y1
    wx, wy = px - x1, py - y1
    c2 = vx * vx + vy * vy
    t = 0.0 if c2 == 0 else max(0.0, min(1.0, (vx * wx + vy * wy) / c2))
    dx, dy = px - (x1 + t * vx), py - (y1 + t * vy)
    return math.hypot(dx, dy)


def in_tri(px, py, ax, ay, bx, by, cx, cy):
    def sign(x1, y1, x2, y2, x3, y3):
        return (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)

    d1 = sign(px, py, ax, ay, bx, by)
    d2 = sign(px, py, bx, by, cx, cy)
    d3 = sign(px, py, cx, cy, ax, ay)
    neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (neg and pos)


def in_round_rect(px, py, x1, y1, x2, y2, r):
    cx = min(max(px, x1 + r), x2 - r)
    cy = min(max(py, y1 + r), y2 - r)
    return math.hypot(px - cx, py - cy) <= r or (
        x1 <= px <= x2 and y1 + r <= py <= y2 - r
    ) or (x1 + r <= px <= x2 - r and y1 <= py <= y2)


# ---------- 三个图标的形状定义 ----------
def shape_download(x, y):
    """解析/下载：向下箭头 + 托盘"""
    w = 0.075
    # 竖杆
    if in_round_rect(x, y, 0.5 - w / 2, 0.16, 0.5 + w / 2, 0.52, w / 2):
        return True
    # 箭头三角
    if in_tri(x, y, 0.5, 0.68, 0.30, 0.44, 0.70, 0.44):
        return True
    # 托盘（U 形）
    if seg_dist(x, y, 0.18, 0.62, 0.18, 0.82) <= w / 2:
        return True
    if seg_dist(x, y, 0.82, 0.62, 0.82, 0.82) <= w / 2:
        return True
    if seg_dist(x, y, 0.18, 0.82, 0.82, 0.82) <= w / 2:
        return True
    return False


def shape_clock(x, y):
    """记录：时钟"""
    d = math.hypot(x - 0.5, y - 0.5)
    ring = 0.34
    w = 0.038
    if abs(d - ring) <= w:
        return True
    # 时针
    if seg_dist(x, y, 0.5, 0.5, 0.5, 0.30) <= w:
        return True
    # 分针
    if seg_dist(x, y, 0.5, 0.5, 0.66, 0.56) <= w:
        return True
    return False


def shape_person(x, y):
    """我的：人形"""
    # 头
    if math.hypot(x - 0.5, y - 0.32) <= 0.155:
        return True
    # 肩（半椭圆）
    dx = (x - 0.5) / 0.34
    dy = (y - 0.86) / 0.36
    if dx * dx + dy * dy <= 1.0 and y <= 0.86:
        return True
    return False


SHAPES = {
    'home': shape_download,
    'history': shape_clock,
    'mine': shape_person,
}


def render(shape_fn, color):
    r, g, b = color
    rows = []
    for py in range(SIZE):
        row = []
        for px in range(SIZE):
            hit = 0
            for sy in range(SS):
                for sx in range(SS):
                    nx = (px + (sx + 0.5) / SS) / SIZE
                    ny = (py + (sy + 0.5) / SS) / SIZE
                    if shape_fn(nx, ny):
                        hit += 1
            a = int(round(255 * hit / (SS * SS)))
            row.append((r, g, b, a))
        rows.append(row)
    return rows


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, '..', 'miniprogram', 'assets', 'tabbar')
    out_dir = os.path.normpath(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    for name, fn in SHAPES.items():
        write_png(os.path.join(out_dir, f'{name}.png'), SIZE, SIZE,
                  render(fn, NORMAL))
        write_png(os.path.join(out_dir, f'{name}-active.png'), SIZE, SIZE,
                  render(fn, ACTIVE))
        print(f'  generated {name}.png / {name}-active.png')

    print(f'\n输出目录: {out_dir}')


if __name__ == '__main__':
    main()
