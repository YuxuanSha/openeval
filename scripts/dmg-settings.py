"""Finder layout for the OpenEval macOS disk image (dmgbuild 1.6.7)."""
from pathlib import Path

app = Path(defines["app"]).resolve()
if not app.is_dir() or app.name != "OpenEval.app":
    raise ValueError("Expected an existing OpenEval.app")

guide = Path(defines["guide"]).resolve()
if not guide.is_file() or guide.name != "首次打开 - Start Here.txt":
    raise ValueError("Expected the bilingual first-open guide")

files = [str(app), str(guide)]
symlinks = {"Applications": "/Applications"}
format = "UDZO"
filesystem = "HFS+"
background = str(Path(defines["background"]).resolve())
icon = str(app / "Contents/Resources/OpenEval.icns")
window_rect = ((160, 120), (720, 550))
default_view = "icon-view"
icon_locations = {"OpenEval.app": (180, 173), "Applications": (540, 173), guide.name: (613, 402)}
icon_size = 96
text_size = 16
label_pos = "bottom"
show_status_bar = False
show_toolbar = False
show_tab_view = False
show_pathbar = False
show_sidebar = False
include_icon_view_settings = True
hide_extensions = [guide.name]

