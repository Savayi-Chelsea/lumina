"""Generate the five profile cover illustrations as SVG files in public/covers/.

Each cover matches a `banner_theme` value: horizon (Nairobi skyline at sunset),
savanna (acacia plains), coast (dhow on the Indian Ocean), night (runway at
night) and dawn (Mount Kenya at sunrise). Output is deterministic, so rerunning
produces identical files.
"""
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "covers"
W, H = 1200, 300


def svg(body, defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice">'
            f"<defs>{defs}</defs>{body}</svg>\n")


def gradient(gid, stops, vertical=True):
    coords = 'x1="0" y1="0" x2="0" y2="1"' if vertical else 'x1="0" y1="0" x2="1" y2="0"'
    parts = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<linearGradient id="{gid}" {coords}>{parts}</linearGradient>'


def hills(rng, base, amplitude, color, step=60, opacity=1.0):
    points = [f"0,{H}"]
    for x in range(0, W + step, step):
        points.append(f"{x},{base - rng.uniform(0, amplitude):.0f}")
    points.append(f"{W},{H}")
    return f'<polygon points="{" ".join(points)}" fill="{color}" opacity="{opacity}"/>'


def plane(x, y, scale, color, angle=-8):
    return (f'<g transform="translate({x} {y}) rotate({angle}) scale({scale})" fill="{color}">'
            '<path d="M-40 0 L30 -3 Q42 0 30 3 Z"/><path d="M-4 -2 L-18 -26 L-10 -26 L10 -2 Z"/>'
            '<path d="M-4 2 L-18 26 L-10 26 L10 2 Z"/><path d="M-36 -1 L-44 -12 L-39 -12 L-30 -1 Z"/></g>')


def horizon():
    rng = random.Random(1)
    defs = gradient("sky", [(0, "#2b1d4a"), (0.45, "#b2445a"), (0.8, "#f0965a"), (1, "#f9c97c")])
    body = '<rect width="1200" height="300" fill="url(#sky)"/><circle cx="880" cy="215" r="70" fill="#ffd68a" opacity=".85"/>'
    body += hills(rng, 270, 20, "#5a2a45", 80, .7)
    x = 0
    while x < W:  # Skyline: towers clustered toward the centre like the Nairobi CBD.
        width = rng.randint(22, 48)
        centre = 1 - abs(x - 560) / 700
        height = rng.randint(30, 70) + int(centre * rng.randint(40, 130))
        body += f'<rect x="{x}" y="{300 - height}" width="{width}" height="{height}" fill="#2a1630"/>'
        for wy in range(300 - height + 10, 292, 14):
            for wx in range(x + 5, x + width - 6, 10):
                if rng.random() < .28:
                    body += f'<rect x="{wx}" y="{wy}" width="4" height="6" fill="#ffcf7a" opacity=".8"/>'
        x += width + rng.randint(2, 10)
    body += '<polygon points="540,300 552,92 560,70 568,92 580,300" fill="#2a1630"/>'  # KICC-like spire
    body += '<rect x="520" y="150" width="80" height="12" rx="6" fill="#2a1630"/>'
    return svg(body + plane(250, 70, 1.1, "#fff3e0"), defs)


def savanna():
    rng = random.Random(2)
    defs = gradient("sky", [(0, "#f6d39a"), (0.6, "#f2b56b"), (1, "#e08a4a")])
    body = '<rect width="1200" height="300" fill="url(#sky)"/><circle cx="300" cy="170" r="80" fill="#fff0c4" opacity=".75"/>'
    body += hills(rng, 230, 25, "#c98a4b", 90, .8) + hills(rng, 262, 14, "#8f5a2e", 70)
    for tx, scale in ((760, 1.2), (980, .8), (150, .7), (560, .55)):  # Acacia trees.
        body += (f'<g transform="translate({tx} 262) scale({scale})" fill="#3d2616">'
                 '<path d="M-4 0 L-2 -70 L-30 -96 L-26 -99 L0 -78 L22 -102 L26 -99 L4 -72 L4 0 Z"/>'
                 '<ellipse cx="0" cy="-104" rx="90" ry="16"/><ellipse cx="-30" cy="-112" rx="46" ry="10"/>'
                 '<ellipse cx="34" cy="-114" rx="40" ry="9"/></g>')
    for gx in (640, 688):  # Giraffes.
        body += (f'<g transform="translate({gx} 262)" fill="#3d2616"><rect x="-14" y="-40" width="30" height="16" rx="7"/>'
                 '<rect x="-12" y="-26" width="3" height="26"/><rect x="10" y="-26" width="3" height="26"/>'
                 '<path d="M10 -38 L22 -86 L28 -86 L18 -36 Z"/><ellipse cx="29" cy="-87" rx="8" ry="4"/></g>')
    return svg(body, defs)


def coast():
    rng = random.Random(3)
    defs = gradient("sky", [(0, "#8fd0e0"), (0.55, "#cdeaf0"), (1, "#f8f2dc")]) + gradient("sea", [(0, "#2a8aa6"), (1, "#145a70")])
    body = '<rect width="1200" height="300" fill="url(#sky)"/><circle cx="1010" cy="70" r="36" fill="#fff6d0"/>'
    body += '<rect y="175" width="1200" height="125" fill="url(#sea)"/>'
    for i in range(26):  # Wave highlights.
        y = 190 + rng.randint(0, 100)
        x = rng.randint(0, 1150)
        body += f'<path d="M{x} {y} q12 -5 24 0" stroke="#e6f7fb" stroke-width="2" fill="none" opacity=".6"/>'
    body += '<path d="M0 300 L0 250 Q160 228 360 262 Q420 274 460 300 Z" fill="#efdcae"/>'  # Beach.
    body += ('<g transform="translate(700 190)"><path d="M-70 0 L70 0 L52 22 L-56 22 Z" fill="#5b3a22"/>'
             '<rect x="-2" y="-96" width="4" height="96" fill="#4a2f1b"/><path d="M2 -94 L62 -8 L2 -8 Z" fill="#fbf5e8"/></g>')
    for px, lean in ((90, -12), (190, 8)):  # Palms.
        body += (f'<g transform="translate({px} 258) rotate({lean})" fill="#2f4a2a"><path d="M-4 0 Q-2 -60 6 -120 L12 -120 Q6 -60 6 0 Z" fill="#6b4a2c"/>'
                 '<path d="M9 -120 q-50 -10 -70 20 q35 -22 70 -20Z"/><path d="M9 -120 q50 -12 72 18 q-36 -22 -72 -18Z"/>'
                 '<path d="M9 -120 q-26 -40 -64 -36 q36 6 64 36Z"/><path d="M9 -120 q26 -42 66 -34 q-38 8 -66 34Z"/></g>')
    return svg(body + plane(420, 60, .8, "#ffffff", -4), defs)


def night():
    rng = random.Random(4)
    defs = gradient("sky", [(0, "#0b0f2a"), (0.7, "#1d2550"), (1, "#3a3a6a")])
    body = '<rect width="1200" height="300" fill="url(#sky)"/>'
    for _ in range(140):
        body += f'<circle cx="{rng.randint(0, W)}" cy="{rng.randint(0, 200)}" r="{rng.choice((0.8, 1.1, 1.5))}" fill="#fff" opacity="{rng.uniform(.4, 1):.2f}"/>'
    body += '<circle cx="1040" cy="60" r="26" fill="#f4f1de"/><circle cx="1052" cy="54" r="24" fill="#0f1433"/>'
    body += '<polygon points="0,300 0,240 1200,240 1200,300" fill="#11152e"/>'
    body += '<polygon points="380,300 560,240 640,240 820,300" fill="#232948"/>'  # Runway in perspective.
    for i in range(8):
        t = i / 8
        y = 242 + t * 56
        left, right = 560 - 180 * t, 640 + 180 * t
        body += f'<circle cx="{left:.0f}" cy="{y:.0f}" r="{1.5 + 3 * t:.1f}" fill="#ffd36b"/><circle cx="{right:.0f}" cy="{y:.0f}" r="{1.5 + 3 * t:.1f}" fill="#ffd36b"/>'
        body += f'<rect x="{598 - 2 * t:.0f}" y="{y:.0f}" width="{4 + 6 * t:.0f}" height="{2 + 4 * t:.0f}" fill="#e8e8f0" opacity=".7"/>'
    body += '<rect x="150" y="196" width="10" height="44" fill="#1b2142"/><rect x="138" y="182" width="34" height="18" rx="3" fill="#2c3563"/>'
    body += '<rect x="142" y="186" width="26" height="8" fill="#8fd3ff" opacity=".8"/>'  # Control tower.
    return svg(body + plane(760, 110, 1.3, "#d9def5", -14) + '<circle cx="720" cy="118" r="2.5" fill="#ff4d4d"/>', defs)


def dawn():
    rng = random.Random(5)
    defs = gradient("sky", [(0, "#4e5d9a"), (0.45, "#e7a3a0"), (0.8, "#fbd3a6"), (1, "#fde9c8")])
    body = '<rect width="1200" height="300" fill="url(#sky)"/><circle cx="900" cy="150" r="46" fill="#fff1c9" opacity=".9"/>'
    body += '<polygon points="380,300 560,120 600,96 640,118 700,150 900,300" fill="#6d5b84"/>'  # Mount Kenya.
    body += '<polygon points="560,120 600,96 640,118 612,128 596,116 580,130" fill="#fbf7f4"/>'
    body += hills(rng, 250, 40, "#7b6890", 80, .75) + hills(rng, 275, 20, "#4b3f62", 60)
    for _ in range(4):
        x, y = rng.randint(100, 1100), rng.randint(40, 120)
        body += f'<path d="M{x} {y} q6 -6 12 0 q6 -6 12 0" stroke="#3b3550" stroke-width="2" fill="none"/>'
    return svg(body, defs)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, build in (("horizon", horizon), ("savanna", savanna), ("coast", coast), ("night", night), ("dawn", dawn)):
        (OUT / f"{name}.svg").write_text(build(), encoding="utf-8")
        print(f"wrote public/covers/{name}.svg")


if __name__ == "__main__":
    main()
