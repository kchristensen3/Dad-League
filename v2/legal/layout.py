"""Builds web/public/privacy.html and terms.html from the Markdown-ish sources in this folder.

Run: python3 legal/layout.py   (no dependencies). Edit the .md files, not the generated HTML.
"""
import html, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT.parent / "web" / "public"

CSS = """
:root{--teal:#326273;--teal-dark:#193139;--accent:#e8913a;--ink:#0f172a;--muted:#475569;--line:#e2e8f0;--bg:#f1f5f9;--card:#fff}
@media (prefers-color-scheme:dark){:root{--ink:#e2e8f0;--muted:#94a3b8;--line:#1e293b;--bg:#0b1220;--card:#0f172a}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
header{background:var(--teal-dark);color:#fff}
.bar{max-width:760px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;gap:12px}
.bar img{width:36px;height:36px;border-radius:9px}.bar b{font-weight:900;letter-spacing:-.02em;text-transform:uppercase}
.bar nav{margin-left:auto;display:flex;gap:16px;font-size:14px}.bar a{color:#cfe3ea;text-decoration:none}.bar a:hover{color:#fff}
main{max-width:760px;margin:0 auto;padding:28px 20px 64px}
article{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px 24px}
h1{font-size:34px;line-height:1.1;letter-spacing:-.03em;margin:0 0 6px}
.meta{color:var(--muted);font-size:14px;margin:0 0 20px}
h2{font-size:19px;letter-spacing:-.01em;margin:30px 0 8px;padding-top:14px;border-top:1px solid var(--line)}
h3{font-size:16px;margin:18px 0 4px}
p,li{color:var(--ink)}ul{padding-left:22px}li{margin:4px 0}
a{color:var(--teal)}@media (prefers-color-scheme:dark){a{color:#7fb8cb}}
.summary{background:rgba(50,98,115,.08);border-left:4px solid var(--teal);border-radius:10px;padding:12px 16px;margin:16px 0}
footer{color:var(--muted);font-size:13px;text-align:center;margin-top:24px}
"""

def inline(s: str) -> str:
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\[(.+?)\]\((.+?)\)", r'<a href="\2">\1</a>', s)
    return s

def render(md: str) -> tuple[str, str]:
    lines, out, title, in_list, in_box = md.strip().splitlines(), [], "", False, False
    for raw in lines:
        line = raw.rstrip()
        if in_list and not line.startswith("- "):
            out.append("</ul>"); in_list = False
        if line.startswith("# "):
            title = line[2:]; out.append(f"<h1>{inline(title)}</h1>")
        elif line.startswith("## "):
            out.append(f"<h2>{inline(line[3:])}</h2>")
        elif line.startswith("### "):
            out.append(f"<h3>{inline(line[4:])}</h3>")
        elif line.startswith("_") and line.endswith("_"):
            out.append(f'<p class="meta">{inline(line[1:-1])}</p>')
        elif line == ":::":
            out.append("</div>" if in_box else '<div class="summary">'); in_box = not in_box
        elif line.startswith("- "):
            if not in_list: out.append("<ul>"); in_list = True
            out.append(f"<li>{inline(line[2:])}</li>")
        elif line:
            out.append(f"<p>{inline(line)}</p>")
    if in_list: out.append("</ul>")
    return title, "\n".join(out)

for name in ("privacy", "terms"):
    title, body = render((ROOT / f"{name}.md").read_text())
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} · Dad League</title><meta name="description" content="Dad League {html.escape(title)}">
<link rel="icon" href="/icon.svg" type="image/svg+xml"><style>{CSS}</style></head>
<body><header><div class="bar"><a href="/"><img src="/icon.svg" alt=""></a><b>Dad League</b>
<nav><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/">Open the app</a></nav></div></header>
<main><article>
{body}
</article><footer>© 2026 Dad League · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></footer></main></body></html>
"""
    (OUT / f"{name}.html").write_text(page)
    print("wrote", OUT / f"{name}.html")
