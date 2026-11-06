"""Finder layout for the OpenEval macOS disk image (dmgbuild 1.6.7)."""
from pathlib import Path

app = Path(defines["app"]).resolve()
if not app.is_dir() or app.name != "OpenEval.app":
    raise ValueError("Expected an existing OpenEval.app")

files = [str(app)]
symlinks = {"Applications": "/Applications"}
format = "UDZO"
filesystem = "HFS+"
background = str(Path(defines["background"]).resolve())
icon = str(app / "Contents/Resources/OpenEval.icns")
window_rect = ((160, 120), (720, 450))
default_view = "icon-view"
icon_locations = {"OpenEval.app": (180, 190), "Applications": (540, 190)}
icon_size = 112
text_size = 16
label_pos = "bottom"
show_status_bar = False
show_toolbar = False
show_tab_view = False
show_pathbar = False
show_sidebar = False
include_icon_view_settings = True
hide_extensions = ["OpenEval.app"]

