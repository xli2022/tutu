#!/usr/bin/env python3
"""Cut the three fonts down to the characters 还泪记 actually uses.

A full CJK font is 4-26 MB; the game needs a few thousand glyphs, so each
font is subset to the text that will be set in it and saved as WOFF2 next
to this script. Run it again whenever the story or the interface text
changes:

    pip install fonttools brotli
    python3 apps/honglou/fonts/build.py <dir with the source TTFs>

Sources (all SIL Open Font License 1.1, licences alongside):
  LXGWWenKai-Regular.ttf     github.com/lxgw/LxgwWenKai        -> wenkai.woff2
  MaShanZheng-Regular.ttf    github.com/google/fonts (ofl/)    -> mashanzheng.woff2
  ZhiMangXing-Regular.ttf    github.com/google/fonts (ofl/)    -> zhimangxing.woff2

What goes where:
  wenkai       every character in the game's files (story, interface)
  mashanzheng  the brush lettering: chapter titles, seals, speaker names,
               poem and ending titles, and the interface's labels
  zhimangxing  the red marginal notes (@note lines in story.js)
"""
import os
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)

ASCII = "".join(chr(c) for c in range(0x20, 0x7F))
PUNCT = "，。、；：？！「」『』（）《》〈〉…—·～　“”‘’〔〕【】"


def read(name):
    with open(os.path.join(APP, name), encoding="utf-8") as f:
        return f.read()


def cjk(s):
    return {ch for ch in s if ord(ch) > 0x2E7F}


def main(src):
    files = [f for f in os.listdir(APP) if f.endswith((".js", ".html", ".css")) and not f.startswith("lab")]
    everything = set()
    for f in files:
        everything |= cjk(read(f))

    story = read("story.js")
    engine = read("engine.js")
    ui = read("index.html") + read("honglou.js")

    brush = set()
    for line in re.findall(r"^\s*##(.*)$", story, re.M):
        brush |= cjk(line)
    for field in re.findall(r'\b(?:title|seal|by|name|kind|season)\s*:\s*"([^"]*)"', story):
        brush |= cjk(field)
    brush |= cjk(" ".join(re.findall(r'"([一-鿿]{1,4})"\s*:', engine)))
    brush |= cjk(ui)
    brush |= cjk(PUNCT)

    hand = set()
    for line in re.findall(r"^\s*@note(.*)$", story, re.M):
        hand |= cjk(line)

    jobs = [
        ("LXGWWenKai-Regular.ttf", "wenkai.woff2", everything | cjk(PUNCT), True),
        ("MaShanZheng-Regular.ttf", "mashanzheng.woff2", brush, False),
        ("ZhiMangXing-Regular.ttf", "zhimangxing.woff2", hand | cjk(PUNCT), False),
    ]
    for source, out, chars, vertical in jobs:
        font = TTFont(os.path.join(src, source))
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"] if vertical else []
        opts.hinting = False
        opts.desubroutinize = True
        opts.name_IDs = ["*"]
        opts.name_languages = ["*"]
        opts.notdef_outline = True
        sub = subset.Subsetter(opts)
        sub.populate(text="".join(sorted(chars)) + ASCII)
        sub.subset(font)
        path = os.path.join(HERE, out)
        font.flavor = "woff2"
        font.save(path)
        print("%-18s %5d glyphs  %7.1f KB" % (out, len(chars), os.path.getsize(path) / 1024))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
