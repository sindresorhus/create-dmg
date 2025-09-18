import CoreGraphics
import CoreImage
import Foundation
import CoreImage.CIFilterBuiltins
import ImageIO
import UniformTypeIdentifiers

func cgContext(width: Int, height: Int) -> CGContext? {
    CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
    )
}

func perspectiveTransform(image: CGImage, width: Int, height: Int) -> CGImage? {
    let ciImage = CIImage(cgImage: image)
    let filter = CIFilter.perspectiveTransform()

    let w = CGFloat(width)
    let h = CGFloat(height)

    filter.inputImage = ciImage
    filter.topLeft = CGPoint(x: w * 0.08, y: h)
    filter.topRight = CGPoint(x: w * 0.92, y: h)
    filter.bottomLeft = CGPoint(x: 0, y: 0)
    filter.bottomRight = CGPoint(x: w, y: 0)

    guard let outputImage = filter.outputImage else { return nil }

    let inputExtent = ciImage.extent
    let croppedImage = outputImage.cropped(to: inputExtent)

    let ciContext = CIContext()
    return ciContext.createCGImage(croppedImage, from: inputExtent)
}

func resizeImage(image: CGImage, width: Int, height: Int) -> CGImage? {
    guard let ctx = cgContext(width: width, height: height) else { return nil }

    ctx.interpolationQuality = .high
    ctx.clear(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

    return ctx.makeImage()
}

func compositeImages(baseImage: CGImage, overlayImage: CGImage, offsetY: CGFloat) -> CGImage? {
    let width = baseImage.width
    let height = baseImage.height
    
    guard let ctx = cgContext(width: width, height: height) else { return nil }
    
    // Draw base image
    ctx.draw(baseImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    
    // Calculate centered position with offset (matching GraphicsMagick's gravity('Center').geometry('+0-offset'))
    let overlayWidth = overlayImage.width
    let overlayHeight = overlayImage.height
    
    // Center horizontally and vertically, then apply upward offset
    // CoreGraphics uses bottom-left origin, positive offsetY moves overlay up
    let x = CGFloat(width - overlayWidth) / 2.0
    let centerY = CGFloat(height - overlayHeight) / 2.0
    let y = centerY + offsetY
    
    
    // Draw overlay image
    ctx.draw(overlayImage, in: CGRect(x: x, y: y, width: CGFloat(overlayWidth), height: CGFloat(overlayHeight)))
    
    return ctx.makeImage()
}

func loadImage(from path: String) -> CGImage? {
    guard let imageSource = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else {
        return nil
    }
    
    return CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
}

func saveImage(_ image: CGImage, to path: String) -> Bool {
    guard let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        return false
    }
    
    CGImageDestinationAddImage(destination, image, nil)
    return CGImageDestinationFinalize(destination)
}

// Main program
guard CommandLine.arguments.count == 4 else {
    fputs("Usage: compose-icon <app-icon-path> <mount-icon-path> <output-path>\n", stderr)
    exit(1)
}

let appIconPath = CommandLine.arguments[1]
let mountIconPath = CommandLine.arguments[2]
let outputPath = CommandLine.arguments[3]

guard let appImage = loadImage(from: appIconPath),
      let mountImage = loadImage(from: mountIconPath) else {
    fputs("Error: Could not load input images\n", stderr)
    exit(1)
}

let appIconSize = (width: appImage.width, height: appImage.height)
let mountIconSize = (width: mountImage.width, height: mountImage.height)

// Apply perspective transformation
guard let transformedAppImage = perspectiveTransform(
    image: appImage,
    width: appIconSize.width,
    height: appIconSize.height
) else {
    fputs("Error: Could not apply perspective transformation\n", stderr)
    exit(1)
}

// Resize app icon to fit inside mount icon (from JS: width / 1.58, height / 1.82)
let resizedWidth = Int((Double(mountIconSize.width) / 1.58).rounded())
let resizedHeight = Int((Double(mountIconSize.height) / 1.82).rounded())

guard let resizedAppImage = resizeImage(
    image: transformedAppImage,
    width: resizedWidth,
    height: resizedHeight
) else {
    fputs("Error: Could not resize app image\n", stderr)
    exit(1)
}

// Composite images with offset (from JS: mountIconSize.height * 0.063)
let offsetY = CGFloat(mountIconSize.height) * 0.063

guard let composedImage = compositeImages(
    baseImage: mountImage,
    overlayImage: resizedAppImage,
    offsetY: offsetY
) else {
    fputs("Error: Could not composite images\n", stderr)
    exit(1)
}

// Save result
guard saveImage(composedImage, to: outputPath) else {
    fputs("Error: Could not save output image\n", stderr)
    exit(1)
}
