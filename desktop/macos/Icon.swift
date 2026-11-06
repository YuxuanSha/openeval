// OpenEval — Open Aperture icon. Original artwork, 2026.
// Drop-in replacement for desktop/macos/Icon.swift. AppKit only; no runtime assets.
// Usage: icon-maker OUTPUT.iconset [EXTRAS_DIRECTORY]
import AppKit

func color(_ hex: UInt32, alpha: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255,
            green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: alpha)
}

// A circular O opens into a geometric e. The lower-right aperture remains visible
// at 16 px. Coordinates are bottom-up in a 1024-square optical design space.
func aperture(_ width: CGFloat = 112, small: Bool = false) -> CGPath {
    let p = CGMutablePath()
    p.move(to: CGPoint(x: 480, y: 526))
    p.addLine(to: CGPoint(x: 758, y: 526))
    p.addArc(center: CGPoint(x: 512, y: 526), radius: 246,
             startAngle: 0, endAngle: (small ? 310 : 316) * .pi / 180,
             clockwise: false)
    return p.copy(strokingWithWidth: width, lineCap: .round, lineJoin: .round, miterLimit: 1)
}

func gradient(_ colors: [NSColor], in path: CGPath, angle: CGFloat) {
    let c = NSGraphicsContext.current!.cgContext
    c.saveGState(); c.addPath(path); c.clip()
    NSGradient(colors: colors)!.draw(in: NSRect(x: 0, y: 0, width: 1024, height: 1024), angle: angle)
    c.restoreGState()
}

func drawIcon(size: Int, flat: Bool = false, markOnly: Bool = false, ink: NSColor? = nil) -> NSBitmapImageRep {
    let c = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
        bytesPerRow: size * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: c, flipped: false)
    c.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)
    let small = size <= 32
    let simple = flat || size <= 64
    // Core Graphics shadows use device-space values, independently of this CTM.
    let shadowScale = CGFloat(size) / 1024
    let tile = CGPath(roundedRect: CGRect(x: 80, y: 80, width: 864, height: 864),
                      cornerWidth: 194, cornerHeight: 194, transform: nil)
    if !markOnly {
        // A modest baked shadow and transparent surround for legacy .icns delivery.
        if !simple {
            c.saveGState()
            c.setShadow(offset: CGSize(width: 0, height: -12 * shadowScale), blur: 23 * shadowScale, color: color(0x000000, alpha: 0.22).cgColor)
            c.addPath(tile); c.setFillColor(color(0x1C2020).cgColor); c.fillPath()
            c.restoreGState()
        }
        if simple {
            c.addPath(tile); c.setFillColor(color(0x202424).cgColor); c.fillPath()
        } else {
            gradient([color(0x141818), color(0x292E2D)], in: tile, angle: 90)
            c.saveGState(); c.addPath(tile); c.clip()
            // Thin machined rim: kept subordinate to the symbol.
            let rim = CGPath(roundedRect: CGRect(x: 82, y: 82, width: 860, height: 860),
                             cornerWidth: 192, cornerHeight: 192, transform: nil)
            c.addPath(rim); c.setLineWidth(3)
            c.setStrokeColor(color(0xFFFFFF, alpha: 0.13).cgColor); c.strokePath()
            c.restoreGState()
        }
    }
    let mark = aperture(small ? 119 : 112, small: small)
    if markOnly || simple {
        c.addPath(mark); c.setFillColor((ink ?? color(0xA5EE72)).cgColor); c.fillPath()
    } else {
        // Shallow enamel relief. No perspective or small decorative features.
        c.saveGState()
        c.setShadow(offset: CGSize(width: 0, height: -7 * shadowScale), blur: 12 * shadowScale, color: color(0x000000, alpha: 0.40).cgColor)
        c.addPath(mark); c.setFillColor(color(0x74B449).cgColor); c.fillPath()
        c.restoreGState()
        gradient([color(0x8EDA59), color(0xB8F58A)], in: mark, angle: 90)
    }
    NSGraphicsContext.restoreGraphicsState()
    return NSBitmapImageRep(cgImage: c.makeImage()!)
}

func writePNG(_ image: NSBitmapImageRep, _ url: URL) throws {
    guard let data = image.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "OpenEvalIcon", code: 1, userInfo: [NSLocalizedDescriptionKey: "PNG encoding failed"])
    }
    try data.write(to: url, options: .atomic)
}

if CommandLine.arguments.count < 2 {
    fputs("Usage: icon-maker OUTPUT.iconset [EXTRAS_DIRECTORY]\n", stderr)
    exit(2)
}
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
for points in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        try writePNG(drawIcon(size: points * scale), output.appendingPathComponent("icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"))
    }
}
if CommandLine.arguments.count > 2 {
    let extras = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
    try FileManager.default.createDirectory(at: extras, withIntermediateDirectories: true)
    for size in [16, 24, 32, 48, 64, 128, 256, 512, 1024] {
        try writePNG(drawIcon(size: size), extras.appendingPathComponent("openeval-\(size).png"))
    }
    try writePNG(drawIcon(size: 1024, flat: true), extras.appendingPathComponent("openeval-flat-1024.png"))
    try writePNG(drawIcon(size: 1024, markOnly: true), extras.appendingPathComponent("openeval-mark-1024.png"))
    try writePNG(drawIcon(size: 1024, markOnly: true, ink: color(0x202424)), extras.appendingPathComponent("openeval-mark-ink-1024.png"))
    try writePNG(drawIcon(size: 1024, markOnly: true, ink: color(0xFFFFFF)), extras.appendingPathComponent("openeval-mark-white-1024.png"))
}
