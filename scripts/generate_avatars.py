"""Illustrated portrait avatars for seeded alumni (local only, no external service).

Each portrait is drawn with Pillow from a seed derived from the person's
synthetic id, so the same person always gets the same face. Variation covers
skin tone, face shape, hairstyle, head covering, facial hair, glasses,
earrings, attire and background. Hairstyle and attire follow the first name's
usual presentation; ambiguous names get neutral styles.
"""
import hashlib
import io
import random

from PIL import Image, ImageDraw

SIZE = 400
SCALE = 2  # Drawn at 800 px and downsampled for smooth edges.

FEMININE = {"Agnes", "Akinyi", "Amina", "Chepkoech", "Cynthia", "Dorcas", "Esther", "Eunice", "Faith", "Gladys", "Grace",
            "Halima", "Irene", "Joy", "Lilian", "Linda", "Nafula", "Naomi", "Purity", "Rachel", "Rehema", "Tabitha", "Umi",
            "Wanjiku", "Winnie", "Zawadi"}
MASCULINE = {"Baraka", "Brian", "Collins", "Daniel", "David", "Edwin", "Felix", "George", "Hassan", "Isaac", "James", "Kamau",
             "Kevin", "Michael", "Moses", "Peter", "Quentin", "Samuel", "Stephen", "Victor", "Vincent", "Yusuf"}
COVERED = {"Amina", "Halima", "Rehema", "Umi"}  # Sometimes shown with a hijab.

SKIN = ["#4a2c1d", "#5a3825", "#6b4026", "#7a4a2a", "#8d5524", "#9c6236", "#a8703f", "#b98050", "#c68642"]
HAIR = ["#141012", "#1d1517", "#2a1c18", "#3a2a22", "#4d3a30"]
BACKGROUNDS = ["#dfe9f3", "#f3e3d3", "#e4efe3", "#efe1ec", "#e6e3f5", "#f6ecd2", "#dcefee", "#f2dcdc"]
CLOTHES = ["#26324a", "#5b2333", "#2f5d50", "#6b4f2a", "#3d3d46", "#7a2e3b", "#1f4e79", "#4a5d23", "#8a5a44", "#55406b"]
SCARVES = ["#7a2e3b", "#2f5d50", "#1f4e79", "#c58b2a", "#55406b", "#8a5a44"]


def shade(hex_color, factor):
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(c * factor))) for c in (r, g, b))


def presentation(first_name):
    if first_name in FEMININE:
        return "f"
    if first_name in MASCULINE:
        return "m"
    return "n"


def portrait(seed_text, first_name):
    rng = random.Random(int(hashlib.sha256(seed_text.encode()).hexdigest()[:16], 16))
    kind = presentation(first_name)
    s = SIZE * SCALE
    img = Image.new("RGB", (s, s), rng.choice(BACKGROUNDS))
    d = ImageDraw.Draw(img)
    u = s / 400  # Design units are on a 400 px grid.

    def box(x0, y0, x1, y1):
        return [x0 * u, y0 * u, x1 * u, y1 * u]

    skin = rng.choice(SKIN)
    hair = rng.choice(HAIR)
    clothes = rng.choice(CLOTHES)
    face_w = rng.uniform(108, 124)
    face_h = rng.uniform(136, 150)
    cx, cy = 200, 200
    hijab = kind == "f" and first_name in COVERED and rng.random() < 0.7
    style = ("hijab" if hijab else rng.choice(
        ["afro", "puff", "braids", "bun", "short_natural", "headwrap", "bob"] if kind == "f"
        else ["crop", "crop", "fade", "bald", "waves"] if kind == "m"
        else ["short_natural", "crop", "afro"]))

    # Long hair and head coverings sit behind the shoulders.
    if style == "braids":
        d.rounded_rectangle(box(cx - face_w * 0.95, cy - 40, cx + face_w * 0.95, cy + 170), radius=60 * u, fill=hair)
    if style == "bob":
        d.rounded_rectangle(box(cx - face_w * 0.9, cy - 70, cx + face_w * 0.9, cy + 70), radius=70 * u, fill=hair)
    scarf = rng.choice(SCARVES)
    if style == "hijab":
        d.ellipse(box(cx - face_w * 0.98, cy - face_h * 0.78, cx + face_w * 0.98, cy + face_h * 0.95), fill=scarf)
        d.polygon([(cx - 120) * u, 400 * u, (cx - 96) * u, (cy + 40) * u, (cx + 96) * u, (cy + 40) * u, (cx + 120) * u, 400 * u], fill=scarf)

    # Shoulders and attire.
    attire = rng.choice(["blazer", "shirt", "crew", "blazer"]) if style != "hijab" else "crew"
    d.rounded_rectangle(box(70, 300, 330, 470), radius=90 * u, fill=clothes)
    d.rectangle(box(cx - 24, cy + 50, cx + 24, 318), fill=shade(skin, 0.9))  # Neck.
    if attire == "blazer":
        shirt = rng.choice(["#f4f4f2", "#dfe8f1", "#f3e9e4"])
        d.polygon([(cx - 34) * u, 300 * u, cx * u, 360 * u, (cx + 34) * u, 300 * u], fill=shirt)
        d.polygon([(cx - 34) * u, 300 * u, (cx - 6) * u, 400 * u, (cx - 60) * u, 400 * u, (cx - 70) * u, 312 * u], fill=shade(clothes, 0.8))
        d.polygon([(cx + 34) * u, 300 * u, (cx + 6) * u, 400 * u, (cx + 60) * u, 400 * u, (cx + 70) * u, 312 * u], fill=shade(clothes, 0.8))
        if kind == "m" and rng.random() < 0.5:
            d.polygon([(cx - 7) * u, 318 * u, (cx + 7) * u, 318 * u, (cx + 10) * u, 380 * u, cx * u, 392 * u, (cx - 10) * u, 380 * u],
                      fill=rng.choice(["#7a2e3b", "#1f4e79", "#2f5d50", "#c58b2a"]))
    elif attire == "shirt":
        d.polygon([(cx - 30) * u, 300 * u, (cx - 4) * u, 330 * u, (cx - 44) * u, 330 * u], fill=shade(clothes, 1.35))
        d.polygon([(cx + 30) * u, 300 * u, (cx + 4) * u, 330 * u, (cx + 44) * u, 330 * u], fill=shade(clothes, 1.35))
    else:
        d.ellipse(box(cx - 32, 286, cx + 32, 318), fill=shade(skin, 0.9))

    # Ears, face.
    for side in (-1, 1):
        ex = cx + side * face_w * 0.5
        d.ellipse(box(ex - 12, cy - 10, ex + 12, cy + 24), fill=shade(skin, 0.92))
    d.ellipse(box(cx - face_w / 2, cy - face_h / 2, cx + face_w / 2, cy + face_h / 2), fill=skin)

    # Hair on top of the head.
    top = cy - face_h / 2
    if style in ("crop", "waves", "short_natural"):
        thickness = {"crop": 16, "waves": 18, "short_natural": 28}[style]
        d.chord(box(cx - face_w / 2 - 4, top - thickness, cx + face_w / 2 + 4, cy + 10), 180, 360, fill=hair)
        d.ellipse(box(cx - face_w / 2 + 6, top + 18, cx + face_w / 2 - 6, cy + face_h / 2), fill=skin)
        if style == "waves":
            for i in range(4):
                y = top - 6 + i * 7
                d.arc(box(cx - 40, y, cx + 40, y + 20), 200, 340, fill=shade(hair, 1.8), width=int(2 * u))
    elif style == "fade":
        d.chord(box(cx - face_w / 2, top - 22, cx + face_w / 2, cy - 10), 180, 360, fill=hair)
        d.ellipse(box(cx - face_w / 2 + 4, top + 14, cx + face_w / 2 - 4, cy + face_h / 2), fill=skin)
    elif style == "afro":
        r = rng.uniform(88, 104)
        d.ellipse(box(cx - r, top - 50, cx + r, top + r * 1.25), fill=hair)
        d.ellipse(box(cx - face_w / 2, top + 30, cx + face_w / 2, cy + face_h / 2), fill=skin)
    elif style == "puff":
        d.ellipse(box(cx - 46, top - 74, cx + 46, top + 10), fill=hair)
        d.chord(box(cx - face_w / 2 - 2, top - 8, cx + face_w / 2 + 2, cy + 20), 180, 360, fill=hair)
        d.ellipse(box(cx - face_w / 2 + 4, top + 16, cx + face_w / 2 - 4, cy + face_h / 2), fill=skin)
    elif style == "bun":
        d.ellipse(box(cx - 30, top - 52, cx + 30, top + 4), fill=hair)
        d.chord(box(cx - face_w / 2 - 2, top - 10, cx + face_w / 2 + 2, cy + 20), 180, 360, fill=hair)
        d.ellipse(box(cx - face_w / 2 + 4, top + 16, cx + face_w / 2 - 4, cy + face_h / 2), fill=skin)
    elif style in ("braids", "bob"):
        d.chord(box(cx - face_w / 2 - 8, top - 18, cx + face_w / 2 + 8, cy + 30), 180, 360, fill=hair)
        d.ellipse(box(cx - face_w / 2 + 6, top + 22, cx + face_w / 2 - 6, cy + face_h / 2), fill=skin)
        if style == "braids":
            for i in range(-4, 5):
                x = cx + i * 13
                d.line([x * u, (top - 10) * u, (x + i * 2) * u, (top + 26) * u], fill=shade(hair, 1.9), width=int(2 * u))
    elif style == "headwrap":
        wrap = rng.choice(SCARVES)
        d.ellipse(box(cx - face_w / 2 - 14, top - 64, cx + face_w / 2 + 14, top + 46), fill=wrap)
        d.ellipse(box(cx - 26, top - 84, cx + 34, top - 30), fill=shade(wrap, 0.85))
        d.ellipse(box(cx - face_w / 2, top + 26, cx + face_w / 2, cy + face_h / 2), fill=skin)
    elif style == "hijab":
        d.ellipse(box(cx - face_w / 2 + 6, top + 14, cx + face_w / 2 - 6, cy + face_h / 2 - 2), fill=skin)

    # Facial hair.
    if kind == "m" and rng.random() < 0.45:
        beard = shade(hair, 1.15)
        if rng.random() < 0.5:
            d.chord(box(cx - face_w / 2 + 6, cy - 10, cx + face_w / 2 - 6, cy + face_h / 2 + 4), 0, 180, fill=beard)
            d.ellipse(box(cx - 30, cy + 22, cx + 30, cy + 54), fill=skin)
        d.rounded_rectangle(box(cx - 24, cy + 27, cx + 24, cy + 34), radius=4 * u, fill=beard)

    # Eyes, brows, nose, mouth.
    eye_y = cy - 2
    spacing = rng.uniform(24, 28)
    for side in (-1, 1):
        ex = cx + side * spacing
        d.ellipse(box(ex - 6, eye_y - 5, ex + 6, eye_y + 5), fill="#1a1110")
        d.ellipse(box(ex - 2, eye_y - 3, ex + 1, eye_y), fill="#ffffff")
        d.line([(ex - 11) * u, (eye_y - 15) * u, (ex + 11) * u, (eye_y - 17 - side * 0) * u], fill=shade(hair, 0.9), width=int(4 * u))
    d.arc(box(cx - 9, cy + 6, cx + 9, cy + 26), 20, 160, fill=shade(skin, 0.7), width=int(3 * u))
    smile = rng.uniform(10, 16)
    mouth_y = cy + 36  # Top edge of the open smile.
    d.chord(box(cx - 20, mouth_y - smile, cx + 20, mouth_y + smile), 0, 180, fill="#5a1f22")
    if smile > 12:
        d.chord(box(cx - 15, mouth_y - 4, cx + 15, mouth_y + 6), 0, 180, fill="#f6f1ea")

    if rng.random() < 0.25:  # Glasses.
        frame = rng.choice(["#1a1110", "#5a3825", "#8a6a3a"])
        for side in (-1, 1):
            ex = cx + side * spacing
            d.rounded_rectangle(box(ex - 16, eye_y - 12, ex + 16, eye_y + 12), radius=6 * u, outline=frame, width=int(3 * u))
        d.line([(cx - spacing + 16) * u, eye_y * u, (cx + spacing - 16) * u, eye_y * u], fill=frame, width=int(3 * u))
    if kind == "f" and style != "hijab" and rng.random() < 0.6:  # Earrings.
        color = rng.choice(["#d4a537", "#e8e4dc", "#b5463b"])
        for side in (-1, 1):
            ex = cx + side * face_w * 0.5
            d.ellipse(box(ex - 5, cy + 26, ex + 5, cy + 36), fill=color)

    # Head-and-shoulders framing: crop the central 320-unit square, then downsample.
    img = img.crop((40 * u, 46 * u, 360 * u, 366 * u)).resize((SIZE, SIZE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def main(apply):
    """Store a portrait and pick a cover theme for every seeded alumnus; real members are never touched."""
    import psycopg
    from local_database import local_dsn
    themes = ["horizon", "savanna", "coast", "night", "dawn"]
    with psycopg.connect(local_dsn()) as conn:
        rows = conn.execute("""SELECT p.id, upper(split_part(u.email, '@', 1)), p.full_name FROM users u JOIN profiles p ON p.user_id = u.id
            WHERE u.email LIKE '%%@synthetic.lumina.local' ORDER BY u.email""").fetchall()
        if apply:
            with conn.transaction():
                for profile_id, synthetic_id, full_name in rows:
                    rng = random.Random(f"cover:{synthetic_id}")
                    conn.execute("""INSERT INTO profile_photos (profile_id, content_type, data) VALUES (%s, 'image/png', %s)
                        ON CONFLICT (profile_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP""",
                                 (profile_id, portrait(synthetic_id, full_name.split()[0])))
                    conn.execute("UPDATE profiles SET banner_theme = %s, open_to_opportunities = %s WHERE id = %s",
                                 (rng.choice(themes), rng.random() < 0.3, profile_id))
    print(f"{'Stored' if apply else 'Preview: would store'} portraits and covers for {len(rows)} seeded alumni")


if __name__ == "__main__":
    import argparse
    import sys
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    try:
        main(parser.parse_args().apply)
    except Exception as exc:
        print(f"Avatar seed failed ({type(exc).__name__}: {exc}); rolled back", file=sys.stderr)
        sys.exit(1)
